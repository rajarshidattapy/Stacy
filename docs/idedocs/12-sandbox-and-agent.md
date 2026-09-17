# 12 — Sandbox & Agent (Deep Dive)

The IDE delegates compile/deploy/run/AI-edit work to a remote **sandbox** (containerized dev environment that runs `next dev`, `cargo build`, `soroban` CLI, plus an embedded AI **agent** that can write files and execute commands). Inside the IDE, the entire surface is funneled through `hooks/useSandbox.ts` and exposed to consumers via `useStellarIDE().sandbox` plus `useSandboxContext()`.

> **Important state**: in `hooks/useSandbox.ts` (the file in source today) every method is a `noop` stub and `status` is hard-coded to `"idle"`. The TYPE surface (interfaces, signal shapes, callback registration) is the contract used by the rest of the IDE. The actual transport (websocket / SSE / fetch) is hooked in by an external implementation that swaps the body of `useSandbox` while keeping `UseSandboxReturn` intact. Treat everything below as the **wire contract** the IDE depends on.

---

## 1. Statuses (string-literal unions, all defined in `useSandbox.ts:6-8`)

```ts
export type SandboxStatus  = "idle" | "spawning" | "preview_starting" | "running" | "stopping" | "error";
export type AgentStatus    = "disconnected" | "connecting" | "connected";
export type BindingsStatus = "idle" | "generating" | "success" | "error";
```

State transitions you'll observe:

```
idle ─► spawning ─► preview_starting ─► running ─► stopping ─► idle
                                          │
                                          └─► error (any time)
```

`AgentStatus` tracks whether the in-sandbox agent websocket has handshaked. `BindingsStatus` is its own machine because bindings generation is async and orthogonal to overall sandbox state.

## 2. Wire types

```ts
export interface SandboxInfo {
  sessionId: string;
  previewUrl: string;
  previewPort: number;
  agentPort: number;
}

export interface EditorChange {
  path: string;
  action: "create" | "update" | "delete";
  content: string;          // empty for "delete"
}

export interface ChatResponse {
  chat:   { message: string };          // assistant prose
  editor: { changes: EditorChange[] };  // file mutations to apply
}

export interface ChatProgress {
  phase:   string;     // free-form streaming label ("planning", "patching contracts/...lib.rs", …)
  content: string;     // partial chunk text
}

export interface BindingsResponse {
  success:    boolean;
  contractId: string;
  network:    string;          // "testnet" | "mainnet"
  chat:       { message: string };
  editor:     { changes: EditorChange[] };
  error?:     string;
}

export interface SandboxFileInfo { name; path; isDirectory; size?; modifiedAt? }
export interface FileTreeNode    { id; name; type: "file"|"folder"; children? }
export interface FileTreeSyncData    { tree: FileTreeNode[]; files: SandboxFileInfo[] }
export interface FileContentSyncData { path: string; content: string }
```

`EditorChange.action` is the **single discriminator** the IDE uses when applying agent diffs: `create` and `update` both end up dispatching `UPDATE_FILE` with `source: "system"` (the reducer doesn't care which); `delete` dispatches `DELETE_FILE`.

## 3. `UseSandboxReturn` — full surface

Every method on the hook (`hooks/useSandbox.ts:67-101`):

| Method                                         | Purpose                                                                                                       |
|------------------------------------------------|---------------------------------------------------------------------------------------------------------------|
| `spawn(envVars?)`                              | Boot a new sandbox session (passes envVars from `EnvConfigModal` into the container). Resolves once `running`. |
| `stop()`                                       | Tear down container.                                                                                          |
| `generateBindings(contractId, network)`        | Ask agent to introspect deployed contract and emit TS client. Triggers a `BindingsResponse`.                   |
| `sendChatMessage(prompt, ctx?)`                | Push user prompt + optional file/selection context into the agent. Triggers progress + final `ChatResponse`.   |
| `executeCommand(command, cwd?)`                | Run a shell command in the sandbox. Output streamed back as `[cmd]` log lines (see [10-logs-terminal.md](./10-logs-terminal.md)). |
| `readFile(path)` / `writeFile(path, content)` / `deleteFile(path)` | Direct FS ops on sandbox.                                                                |
| `listFiles(path?)` / `listFilesRecursive(path?)`| Directory listings.                                                                                          |
| `syncFileTree()`                               | Pull full tree; emit `onFileTreeSync(data)` once.                                                              |
| `setOnChatResponse(handler)`                   | Subscribe to `ChatResponse` (fires on agent.done with chat+editor payload).                                    |
| `setOnChatProgress(handler)`                   | Streaming `ChatProgress` for "thinking" UI.                                                                    |
| `setOnBindingsResponse(handler)`               | One-shot handler for the next `BindingsResponse`.                                                              |
| `setOnFileResponse(handler)`                   | Generic file-op response (read/write/delete acks).                                                             |
| `setOnFileTreeSync(handler)` / `setOnFileContentSync(handler)` | Push notifications when sandbox writes to the FS itself (e.g., `npm install` produced new files). |
| `clearLogs()`, `reset()`                       | Local hook resets.                                                                                             |
| `isConnected`                                  | `agentStatus === "connected"`.                                                                                 |

## 4. `AgentSignal` — full discriminated union

`hooks/useAgentState.ts:21-32`. Every shape the agent emits:

```ts
type AgentSignal =
  | { type: "agent.idle" }
  | { type: "agent.thinking";    phase: "planning" | "executing" | "validating" | "retrying" }
  | { type: "agent.tool_call";   tool: string; args: Record<string, unknown>; iteration: number }
  | { type: "agent.tool_result"; tool: string; success: boolean; duration_ms: number }
  | { type: "agent.retry";       attempt: number; reason: string; failure_type: string }
  | { type: "agent.stream_chunk";content: string }
  | { type: "agent.done";        message: string; file_changes: AgentFileChange[]; model: string; tokens: AgentTokenUsage }
  | { type: "agent.error";       message: string; code: string; recoverable: boolean }
  | { type: "sandbox.starting" }
  | { type: "sandbox.ready" }
  | { type: "sandbox.crashed";   reason: string };

interface AgentFileChange { path: string; operation: "write" | "delete"; content?: string }
interface AgentTokenUsage { input: number; output: number; cost_usd: number }
```

`agent.tool_result.duration_ms` is what the panel renders inside `errorMessage` for failures (`AgentActionPanel` `StepCard`, line 132: `Tool failed after ${duration_ms}ms`).

## 5. `useAgentState` — full state machine

File: `hooks/useAgentState.ts`. Returns:

```ts
{
  status, currentTool, currentFile, retryCount,
  maxRetries: 3, retryReason, tokenUsage, model, lastError, isLoading,
  processSignal(signal), reset(), clearSession(), setDisconnected(_msg),
  phaseGroups: PhaseGroup[],
  lastAction: StepEntry | null
}
```

### `INITIAL_PHASE_GROUPS` (`useAgentState.ts:124-130`)

```ts
[
  { phase: "planning",    label: "Planning",    status: "pending", steps: [] },
  { phase: "building",    label: "Building",    status: "pending", steps: [] },
  { phase: "testing",     label: "Testing",     status: "pending", steps: [] },
  { phase: "deploying",   label: "Deploying",   status: "pending", steps: [] },
  { phase: "integrating", label: "Integrating", status: "pending", steps: [] },
];
```

### Tool → phase mapping (`useAgentState.ts:68-84`)

```ts
const TOOL_PHASE_MAP: Record<string, PhaseKey> = {
  compile_contract:   "building",
  write_file:         "building",
  edit_file:          "building",
  create_file:        "building",
  delete_file:        "building",
  run_command:        "building",
  run_tests:          "testing",
  test_contract:      "testing",
  validate_contract:  "testing",
  deploy_contract:    "deploying",
  upload_wasm:        "deploying",
  instantiate_contract: "deploying",
  generate_bindings:  "integrating",
  configure_contract: "integrating",
  update_frontend_config: "integrating",
};
```

Unknown tool → defaults to `"building"` via `toolPhase(tool)` fallback (line 109).

### Tool labels (`TOOL_LABELS`, lines 86-102)

`compile_contract` → "Compiled contract", `run_command` → "Ran command", etc. Unknown tool: `tool.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())`.

### `makeSummary(tool, args)` (lines 112-122)

| Tool                         | Summary returned                                |
|------------------------------|-------------------------------------------------|
| `write_file`/`edit_file`/`create_file` | `args.path` (or "File updated")        |
| `run_command`                | `args.command.slice(0, 60)` (or "Command executed") |
| any other                    | `toolLabel(tool)`                               |

This summary is what shows under the step label in `AgentActionPanel.StepCard` (line 105). For `deploy_contract` the agent typically returns the contract address as `summary` — `StepCard` regex `/^[A-Z0-9]{56}$/` (line 63) detects this and renders a copy button.

### `processSignal(signal)` — both reducers

Updates two states (`useAgentState.ts:150-247`):

**State reducer**:

| Signal type        | State change                                                                                          |
|--------------------|-------------------------------------------------------------------------------------------------------|
| `agent.idle`       | `status: "idle", isLoading: false`                                                                    |
| `agent.thinking`   | `status: "thinking", isLoading: true`                                                                 |
| `agent.tool_call`  | `status: "executing", currentTool: signal.tool, isLoading: true`                                      |
| `agent.tool_result`| `isLoading: false`                                                                                    |
| `agent.retry`      | `status: "retrying", retryCount: signal.attempt, retryReason: signal.reason`                          |
| `agent.done`       | `status: "done", tokenUsage: signal.tokens, model: signal.model, isLoading: false, currentTool: null` |
| `agent.error`      | `status: "error", lastError: { message, code, recoverable }, isLoading: false`                        |

**`phaseGroups` reducer**:

- `agent.thinking { phase: "planning" }` → planning becomes `active`.
- `agent.tool_call` → `setPhaseStatus(toolPhase(tool), "active")` and stash `_pendingCall = { tool, args, timestamp }` on the phase (line 190).
- `agent.tool_result` → pop `_pendingCall`, push a `StepEntry`:
  ```ts
  {
    id: `step-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    tool, label: toolLabel(tool),
    summary: makeSummary(tool, pending.args),
    status: signal.success ? "success" : "error",
    timestamp: pending.timestamp ?? Date.now(),
    errorMessage: signal.success ? undefined : `Tool failed after ${duration_ms}ms`,
  }
  ```
  If `!signal.success`, the phase status is flipped to `"error"`.
- `agent.done` → all `active` phases → `done`. If `planning` has no steps, push synthetic step `{ tool: "agent.done", label: "Agent finished", summary: signal.message.slice(0,80), status: "success" }` and mark planning `done`.
- `agent.error` → all `active` phases → `error`.

`lastAction` is computed at the bottom of the hook by `phaseGroups.flatMap(g => g.steps).reduce((latest, s) => s.timestamp > latest.timestamp ? s : latest)`. `null` if no steps.

`reset()` / `clearSession()` (`reset = clearSession`) re-seed `INITIAL_PHASE_GROUPS` (with fresh `steps: []` arrays — important to avoid sharing array refs across resets).

`setDisconnected(_msg)` is currently a noop (line 267) — placeholder for surfacing transport disconnects in the panel.

`isAgentSignal(_msg)` (line 5) is exported and returns `false`. It's a stub that downstream type-narrowing code can later implement to filter `AgentSignal` objects out of mixed log streams.

## 6. How `Generate.tsx` glues everything

`components/generate/Generate.tsx`:

```ts
const stellarIDE = useStellarIDE();           // includes sandbox + its inner agentState
const agentState = useAgentState();           // separate, page-level instance for AgentActionPanel
```

> Yes, two `useAgentState()` instances exist. `useSandbox` mints one for internal bookkeeping; `Generate.tsx` mints another for the right-panel UI. The agentic transport is responsible for forwarding signals into both (or the page reads `stellarIDE.sandbox.agentState`). When wiring the real transport, pick one source of truth — feeding the same `processSignal` to both is the simplest fix.

### File sync handlers (lines 901-935)

```ts
useEffect(() => {
  stellarIDE.sandbox.setOnFileTreeSync((data) => {
    const contractNodes = data.tree.filter(n => n.id.startsWith("contracts/") || n.id === "Cargo.toml");
    const frontendNodes = data.tree.filter(n => n.id.startsWith("frontend/"));
    dispatchContract({ type: "SYNC_FILE_TREE", payload: contractNodes });
    dispatchFrontend({ type: "SYNC_FILE_TREE", payload: frontendNodes });
    // log how many items routed to each side
  });

  stellarIDE.sandbox.setOnFileContentSync((data) => {
    pendingFileReads.current.delete(data.path);
    if (data.path.startsWith("contracts/") || data.path === "Cargo.toml") {
      dispatchContract({ type: "SYNC_FILE_CONTENT", payload: data });
    } else {
      dispatchFrontend({ type: "SYNC_FILE_CONTENT", payload: data });
    }
  });
}, [stellarIDE.sandbox]);
```

The IDE physically partitions the workspace by path prefix:

```
contracts/...      → contract reducer
Cargo.toml         → contract reducer (root workspace manifest)
frontend/...       → frontend reducer
anything else      → frontend reducer (default)
```

### Auto-sync on connect (lines 938-942)

```ts
useEffect(() => {
  if (stellarIDE.isSandboxConnected) {
    stellarIDE.sandbox.syncFileTree();
  }
}, [stellarIDE.isSandboxConnected]);
```

### Lazy file content fetching (lines 947-966)

`fetchFileContent(filePath)`:
1. Bail if not connected.
2. Bail if request already pending (`pendingFileReads.current.has(path)`).
3. Bail if cached content is real (not `"// Loading file content..."`).
4. Mark `MARK_FILE_LOADING` placeholder.
5. `stellarIDE.sandbox.readFile(filePath)` — eventual response routes through `setOnFileContentSync`.

### Sync-back to sandbox (lines 969-975)

```ts
const syncFileToSandbox = useCallback((filePath, content) => {
  if (!stellarIDE.isSandboxConnected) return;
  stellarIDE.sandbox.writeFile(filePath, content);
}, [stellarIDE.isSandboxConnected, stellarIDE.sandbox]);
```

Called individually per file when needed. The bulk version (`handleSyncToSandbox`, lines 1927-1957) iterates `Object.keys(activeWorkspace.fileContents)` and writes each one.

## 7. AI file-change application (`pendingAIChanges`)

`Generate.tsx`:

```ts
const [pendingAIChanges, setPendingAIChanges] = useState<{
  path: string;
  action: "create" | "update" | "delete";
  content?: string;
}[]>([]);
const hasPendingChanges = pendingAIChanges.length > 0;
```

When `setOnChatResponse` fires (or `setOnBindingsResponse` for bindings), the response's `editor.changes` array is queued here. `handleApplyEditorChanges(changes: EditorChange[])` then:

1. For each change:
   - `create` / `update` → `dispatch({ type: "UPDATE_FILE", payload: { path, content, source: "system" } })`. If the file doesn't exist in `fileContents` yet, the `UPDATE_FILE` reducer just inserts it (Reducer line 472-479). Tree insertion is handled by `ADD_BINDINGS_FILE` for bindings (line 509-531), which calls `ensureFilePathInTree(state.fileTree, filePath)` to materialize parent folders.
   - `delete` → `dispatch({ type: "DELETE_FILE", payload: { path } })`.
2. If file is open → Monaco's `value` prop swap re-renders the editor.
3. If file is NOT open → `forceModelContentRef.current?.(path, content)` directly mutates the Monaco model's value (so its undo stack starts from the new content). Implementation in `IdeWorkspace.tsx:590-599`:

```ts
const forceSetModelContent = useCallback((path, content) => {
  if (!monacoRef.current) return;
  const model = monacoRef.current.editor.getModels().find((m) => {
    const uriStr = m.uri.toString();
    return uriStr.endsWith(path) || uriStr.includes(path);
  });
  if (model && !model.isDisposed()) model.setValue(content);
}, []);
```

4. Clear `pendingAIChanges`.
5. `previewKey++` so the iframe reloads (`IdeWorkspace.tsx:275-289`).

## 8. Sandbox lifecycle from a user click

```
User clicks "Start Sandbox"
  └─ ActionPanel.onSpawnSandbox prop
       └─ Generate.handleSpawnSandbox
            └─ stellarIDE.sandbox.spawn(envVars)
                 ├─ status: "spawning"     → ActionPanel pill = "spawning"
                 ├─ container boots, agent connects on agentPort
                 ├─ AgentStatus: "connecting" → "connected"
                 ├─ status: "preview_starting"
                 ├─ Next.js dev server boots inside container
                 └─ status: "running", previewUrl = "https://<sessionId>-3000.…"
                       └─ syncFileTree() auto-fires (page useEffect)
                             └─ onFileTreeSync emits → reducers populate
```

Failure paths:
- `agent.error { recoverable: true }` mid-flow → `state.lastError` set; status flips error; user can re-try.
- `sandbox.crashed { reason }` → `setDisconnected(reason)` (today: noop) + `agentStatus → disconnected`.

## 9. Bindings flow (special case)

`useStellarIDE.generateBindings(contractId, onSuccess?)` (`hooks/useStellarIDE.ts:58-131`):

1. Verbose log block.
2. Bail if `!sandbox.isConnected`.
3. `sandbox.setOnBindingsResponse((response) => {...})` — installs a one-shot handler.
4. On response: if `response.success && response.editor?.changes`, call `onSuccess(response.editor.changes)`.
5. `sandbox.generateBindings(contractId, deployer.network)` to actually request.

The `onSuccess` callback in `Generate.tsx` typically dispatches `ADD_BINDINGS_FILE` actions (which auto-open the new TS file in the frontend tab) or pushes them through `pendingAIChanges`.

## 10. Where to look when debugging

| Symptom                                                     | First place to look                                           |
|-------------------------------------------------------------|---------------------------------------------------------------|
| Sandbox stuck in `spawning`                                 | Transport layer (`useSandbox` real impl). Check `[cmd]` logs for boot errors. |
| Tree synced but a file not opening                          | `pendingFileReads.current` deletion in `setOnFileContentSync`. |
| Agent done but no diff applied                              | `handleApplyEditorChanges` call site; `pendingAIChanges` length. |
| Phase panel shows wrong column                              | `TOOL_PHASE_MAP` — add an entry for the tool name.            |
| Step entry has unhelpful summary                            | `makeSummary` — add a case.                                   |
| Active phase never closes                                   | Missing `agent.done`/`agent.error`. Verify the transport forwards every signal type. |
| Two phases active simultaneously                            | Order: tool_call sets active before tool_result for previous one fires. Ensure transport orders correctly. |
