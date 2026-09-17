# 01 — Architecture (Deep Dive)

## 1. Top-down

```
Browser
 └── Next.js 16 (App Router, React 19)
      ├── /                     → landing (components/landing/*) — server-rendered marketing
      ├── /generate             → IDE page (components/generate/Generate.tsx) — client-only
      ├── /thinking             → demo
      └── /api/*                → server routes
            ├── /api/chat                      AI streaming via OpenRouter
            ├── /api/extensions                Federated marketplace + local + Monaco-theme list
            ├── /api/extensions/detail
            ├── /api/extensions/assets/[folder]
            └── /api/extensions/monaco-theme
```

The IDE is a **client-only React tree** at `/generate`. Heavy chrome (`GlobalTopBar`, `HomeSidebar`) is `dynamic(..., { ssr: false })` to avoid SSR cost. Landing uses `lenis/react` for smooth scroll, `framer-motion` for animations, `unicornstudio-react`/`@paper-design/shaders` for decor.

## 2. `/generate` page tree (concrete)

`components/generate/Generate.tsx` mounts:

```
<SandboxProvider sandbox={stellarIDE.sandbox}>
  <div h-screen flex flex-col bg-[#050505] text-zinc-100>
    <GlobalTopBar
      ideMode onIdeModeChange
      interactionMode onInteractionModeChange
      walletAddress walletStatus onConnectWallet onDisconnectWallet
      currentProjectId currentProjectName onSaveProject onOpenProjects onOpenVersions
      isSaving onToggleHomeSidebar onOpenEnvConfig
    />

    <HomeSidebar isOpen onClose onToggle walletAddress walletStatus/>
    {!isHomeSidebarOpen && <left-edge hover detector .../>}

    <div flex-1 flex>
      {!isChatCollapsed && <ChatPanel chatContext onTargetModeChange onSendMessage fileTree fileContents
                                       onApplyEditorChanges onDisconnectWallet walletAddress walletStatus/>}

      <IdeWorkspace
        key={ideMode}
        mode interactionMode workspace deployedContracts dispatch
        onCompile onDeploy onGenerateBindings
        onToggleFileExplorer onToggleActionPanel onToggleTerminal
        onExecuteCommand onOpenEnvConfig
        compilerStatus deployerStatus wasmHex latestContractId isWalletConnected
        network onNetworkChange explorerUrl
        sandboxPreviewUrl isSandboxRunning sandboxStatus onSpawnSandbox onStopSandbox
        bindingsStatus onSyncToSandbox isSandboxConnected
        onTogglePreview hasPendingChanges
        onMonacoSyncReady onForceModelContentReady editorSessionKey
        agentPhaseGroups agentLastAction onClearAgentSession
        isChatCollapsed onToggleChat
        onCodeAction onRefreshFileTree
      />
    </div>

    <SaveProjectDialog .../>
    <EnvConfigModal .../>
    <ProjectsModal .../>
    <VersionsModal .../>
  </div>
</SandboxProvider>
```

- `key={ideMode}` on `IdeWorkspace` forces a fresh mount when user switches contract↔frontend, ensuring Monaco models for the prior mode are disposed cleanly.
- `editorSessionKey={projectSessionKey}` (an integer bumped on `LOAD_PROJECT`) is passed to `<Editor key=…>` inside Workspace; remounts Monaco on project load.

## 3. State sources

| State                                | Lives in                                              | Why                                              |
|--------------------------------------|-------------------------------------------------------|--------------------------------------------------|
| `contractState`, `frontendState`     | `useReducer(workspaceReducer, INITIAL_*)` in `Generate.tsx` | File tree, contents, tabs, logs per mode.   |
| Wallet/compiler/deployer/sandbox/agent| `useStellarIDE()` (composes 4 hooks + agent)         | Domain operations.                               |
| Page-level orchestration             | `useState` in `Generate.tsx`                          | Modal flags, current project, pending AI changes, code selection. |
| Sandbox shared deeply                | `<SandboxProvider/>` (`contexts/SandboxContext.tsx`)  | Avoid prop drilling into `ChatPanel` etc.        |
| Chat thread                          | `@assistant-ui/react` runtime (in-memory)             | Owned by the runtime, not React state.           |
| Monaco editor                        | `monaco-editor` model store + `<Editor/>` wrapper      | View layer; reducer is truth.                    |

## 4. Data flow — user types in Monaco

```
User types
  ┌──────────────────┐
  │ <Editor onChange>│
  └────────┬─────────┘
           ▼
   dispatch UPDATE_FILE { path, content, source: "editor" }
           ▼
   workspaceReducer mutates fileContents[path]
           ▼
   re-render → <Editor value={activeContent}> stays in sync
```

`source: "editor"` lets parent effects skip re-syncing the change back to the sandbox (the sandbox already has it via the user typing — actually no, you sync explicitly via `Sync to Sandbox` button; today `source` is informational only, not consumed by effects). It IS consumed by `syncMonacoToWorkspace` calls before compile so the compile sees the latest user content.

## 5. Data flow — AI selection action

```
User selects code in Monaco
  ▼
editor.onDidChangeCursorSelection
  ▼
expand to whole lines, get text, compute screen coords
  ▼
setSelection({ isVisible: true, position, text, startLine, endLine })

CodeSelectionPopup buttons (Explain / Debug / Fix / Optimize)
  ▼
handleAIAction(action) → onCodeAction(action, { file, startLine, endLine, text })
  ▼
Generate.tsx setCodeSelection({ ...sel, intent: action })
  ▼
ChatContextStrip renders the chip above composer
  ▼
(optional) auto-send via runtime.thread.append(...)
```

## 6. Data flow — chat send

```
User clicks Send (or hits Cmd+Enter)
  ▼
ComposerPrimitive.Send → runtime.thread.append(message)
  ▼
useChatRuntime transport POSTs { messages } to /api/chat
  ▼
streamText({ model: openrouter("..."), messages })
  ▼
toUIMessageStreamResponse() emits SSE-style chunks (text/tool/reasoning/source/finish)
  ▼
useChatRuntime parses each chunk, updates the in-memory thread
  ▼
ThreadPrimitive.Messages re-renders with the new message parts
```

## 7. Data flow — agent (sandbox) → IDE

```
Agent in sandbox emits AgentSignal (e.g., agent.tool_call { tool:"write_file", args:{path, content}, iteration:1 })
  ▼
Sandbox transport (websocket/SSE) decodes
  ▼
useAgentState.processSignal(signal)
  ▼
phaseGroups updated (active phase = TOOL_PHASE_MAP[tool])
  ▼
AgentActionPanel shows step entry, animated phase dot

Agent emits agent.done { file_changes: [...] }
  ▼
sandbox setOnChatResponse handler fires
  ▼
Generate setPendingAIChanges([...changes])

User clicks Sync / Preview
  ▼
For each change:
  - dispatch UPDATE_FILE / DELETE_FILE (source: "system")
  - if file not open in Monaco: forceModelContentRef.current(path, content)
  ▼
Clear pendingAIChanges → previewKey++ → iframe remount
```

## 8. Two parallel modes

| Aspect              | Contract (`mode: "contract"`)          | Frontend (`mode: "frontend"`)            |
|---------------------|----------------------------------------|------------------------------------------|
| Files               | Soroban Rust (`Cargo.toml`, `lib.rs`)  | Next.js (`app/page.tsx`, `package.json`) |
| Path prefix         | `contracts/...`, `Cargo.toml` at root  | `frontend/...` (mostly).                 |
| Right panel content | Compile WASM, Deploy to Stellar, Bindings | Spawn sandbox, Sync to sandbox        |
| Preview button      | Static info card                       | Live iframe of `sandboxPreviewUrl`       |
| Reducer             | `contractState` / `dispatchContract`   | `frontendState` / `dispatchFrontend`     |
| Refresh sidebar btn | Hidden                                 | Visible when `isSandboxConnected`        |
| Logs of `[cargo]`/`[compile]`/`[deploy]`/`[bindings]` | Always routed here | Skipped                                 |
| Logs of `[next]`    | Dropped (npm dev noise)                | Dropped                                  |
| Logs default        | Routed to active mode                  | Routed to active mode                    |

## 9. Two interaction modes

`interactionMode: "agentic" | "manual"` initialized from `?interactionMode=` query (`searchParams.get("interactionMode")` in `Generate.tsx:707-708`):

| Mode    | Right panel             | UX                                                                |
|---------|-------------------------|-------------------------------------------------------------------|
| manual  | `ActionPanel`           | User clicks Compile / Deploy / Sync explicitly. Status pills.     |
| agentic | `AgentActionPanel`      | User chats; agent sends `AgentSignal`s; phase progress is shown. |

Switching to manual mid-flow auto-exits preview mode (`Generate.tsx:742-751`):

```ts
useEffect(() => {
  if (interactionMode === "manual") {
    if (contractState.ui.isPreviewMode) dispatchContract({ type: "TOGGLE_PREVIEW" });
    if (frontendState.ui.isPreviewMode) dispatchFrontend({ type: "TOGGLE_PREVIEW" });
  }
}, [interactionMode]);
```

## 10. Modal architecture

Modals are **rendered inside `Generate.tsx`** outside the main flex container (so they overlay):

| Modal                  | Owner state                | Trigger                                     |
|------------------------|----------------------------|---------------------------------------------|
| `SaveProjectDialog`    | `isSaveDialogOpen`         | `GlobalTopBar` Save button.                 |
| `ProjectsModal`        | `isProjectsModalOpen`      | `GlobalTopBar` Projects button.             |
| `VersionsModal`        | `isVersionsModalOpen`      | `GlobalTopBar` Versions button.             |
| `EnvConfigModal`       | `isEnvConfigOpen`          | `GlobalTopBar` Env button or Workspace env button. |
| `PricingModal`         | `showPricingModal` in `ChatPanel` | Chat upgrade CTAs.                  |
| `AccountsDialog`       | `isSettingsOpen` in `ChatPanel` | Chat settings rail.                  |
| `WalletGuidePopup`     | own state in component     | First-time wallet connect.                  |
| `DeployDialog`         | `showDeployDialog` in `ActionPanel` | Deploy button.                       |

## 11. Files you cannot escape

| File                                              | Lines | Role                                                       |
|---------------------------------------------------|-------|------------------------------------------------------------|
| `components/generate/Generate.tsx`                | ~2.1k | Page orchestrator. Reducers, useStellarIDE, agent, modals. |
| `components/ide/IdeWorkspace.tsx`                 | ~1.0k | IDE shell. Monaco mount. Resizable sidebar.                 |
| `components/ide/ChatPanel.tsx`                    | ~120  | Wraps `assistant-ui` runtime around `Thread`.               |
| `components/assistant-ui/thread-ide.tsx`          | ~245  | The `Thread` UI for the IDE.                                |
| `hooks/useStellarIDE.ts`                          | ~223  | Aggregator → wallet + compiler + deployer + sandbox.        |
| `hooks/useAgentState.ts`                          | ~277  | `AgentSignal` → `PhaseGroup[]`.                             |
| `hooks/useSandbox.ts`                             | ~146  | Sandbox surface (currently stubbed).                        |
| `types/ide.ts`                                    | ~50   | `WorkspaceState`, `FileNode`, `ChatContext`, `IdeMode`.     |
| `lib/fileTreeUtils.ts`                            | ~449  | All tree mutations + validation.                            |
| `lib/fileTransform.ts`                            | ~178  | `transformFilesForBackend`, Cargo.toml generators.          |
| `lib/monacoTheme.ts`                              | ~80   | Theme name union, persistence, fetch loader, event constant.|
| `extension-system/host/extension-host.ts`         | ~189  | Extension activator + module loader.                        |
| `extension-system/vscode-api/types.ts`            | ~287  | Disposable/Position/Range/Uri + extension interfaces.       |
| `app/api/chat/route.ts`                           | ~22   | Streaming chat via OpenRouter.                              |
| `app/api/extensions/route.ts`                     | ~360  | Federated extension list with SVG theme icons.              |

## 12. Initial state seeds

`Generate.tsx`:
- `INITIAL_CONTRACT_STATE` — empty file tree, `terminalLogs: ["Contract workspace ready. Waiting for sandbox..."]`, all UI panels open.
- `INITIAL_FRONTEND_STATE` — pre-populated `fileContents` with placeholder `app/page.tsx`, `app/layout.tsx`, `package.json` etc. so the user has something to look at before connecting a sandbox.

## 13. Critical refs to know about

| Ref                                | Purpose                                                                                      |
|------------------------------------|----------------------------------------------------------------------------------------------|
| `monacoSyncRef`                    | `() => void` — syncs Monaco→state. Called before compile/sync.                               |
| `forceModelContentRef`             | `(path, content) => void` — pushes content into a Monaco model directly. For AI updates to closed files. |
| `fileContentsRef`                  | Mirror of `frontendState.fileContents` for fresh reads inside callbacks (avoid stale closures). |
| `contractFileContentsRef`          | Same for contract state.                                                                     |
| `lastSyncedLogIndex`               | Used by log-routing effect to slice only NEW log lines.                                      |
| `pendingFileReads`                 | `Set<path>` — dedupes outstanding `readFile` requests against the sandbox.                   |
| `iframeRef`                        | The preview iframe (rarely used directly; `key={previewKey}` is the reload mechanism).       |
| `monacoRef._jsxRuntimeDisposable`  | Disposable for the JSX runtime extra-lib registration; available for HMR cleanup.            |

## 14. Concrete bug-trace examples

| Bug                                              | Trace path                                                                              |
|--------------------------------------------------|------------------------------------------------------------------------------------------|
| Compile uses stale file content                  | `handleCompile` → `monacoSyncRef.current()` flushes Monaco → `contractFileContentsRef.current` reads fresh state → `transformFilesForBackend` → `compiler.compile`. |
| Generated bindings file doesn't appear           | `useStellarIDE.generateBindings` registers `setOnBindingsResponse` → response handler dispatches `ADD_BINDINGS_FILE` (which calls `ensureFilePathInTree`). |
| Tab switch loses unsaved typing                  | `IdeWorkspace.tsx` effect (line 609-621) has 100 ms debounced `syncMonacoToWorkspace`. Verify `isPreviewMode` isn't true (guard skips sync). |
| Preview iframe stale after sync                  | `previewKey` effect (line 275-289) requires `hasPendingChanges` to flip false→true→false. |
| Wrong terminal received a log                    | Log routing effect (`Generate.tsx:818-839`) checks regex prefixes. Add prefix → branch.   |
| Two phases active in agent panel                 | `processSignal` switch ordering — verify a `tool_result` arrives before next `tool_call`. |
| Chat shows "Thinking..." forever                 | `streamText` returned but provider emitted no text deltas. Inspect `/api/chat` response in DevTools network tab. |
