# 09 — Action Panels (manual vs agentic) — Deep Dive

Right-hand vertical panel changes by `interactionMode`:

```tsx
{interactionMode === "agentic"
  ? <AgentActionPanel ... />
  : <ActionPanel ... />}
```

Mounted from `IdeWorkspace.tsx:999-1031`.

---

## 1. Manual `ActionPanel.tsx` (~370 lines)

Drives compile / deploy / sandbox / bindings explicitly.

### 1.1 Status type aliases (lines 21-36)

```ts
type CompilerStatus = "IDLE" | "QUEUED" | "COMPILING" | "SUCCESS" | "ERROR";
type DeployerStatus = "IDLE" | "UPLOADING" | "INSTANTIATING" | "SUCCESS" | "ERROR";
type NetworkType    = "testnet" | "mainnet";
type SandboxStatus  = "idle" | "spawning" | "preview_starting" | "running" | "stopping" | "error";
type BindingsStatus = "idle" | "generating" | "success" | "error";
```

### 1.2 Props (lines 38-64)

```ts
interface ActionPanelProps {
  mode: IdeMode;
  isOpen: boolean;
  terminalStatus: TerminalStatus;
  deployedContracts: DeployedContract[];

  onCompile, onDeploy, onGenerateBindings(contractId)

  compilerStatus?, deployerStatus?, wasmHex?, latestContractId?
  isWalletConnected?

  network?, onNetworkChange?, explorerUrl?

  sandboxStatus?, isSandboxConnected?, onSpawnSandbox?, onStopSandbox?
  bindingsStatus?

  onSyncToSandbox?
}
```

### 1.3 Local state (lines 89-90)

```ts
copied: boolean              // for copy-to-clipboard feedback
showDeployDialog: boolean    // controls <DeployDialog>
```

### 1.4 Derived booleans (lines 102-115)

```ts
hasCompiledWasm  = !!wasmHex
isCompiling      = compilerStatus === "COMPILING" || terminalStatus === "compiling"
isDeploying      = deployerStatus === "UPLOADING" || deployerStatus === "INSTANTIATING" || terminalStatus === "deploying"
isSandboxActive  = sandboxStatus === "running"  || sandboxStatus === "preview_starting"
isSandboxBooting = sandboxStatus === "spawning" || sandboxStatus === "preview_starting"
isSandboxStopping= sandboxStatus === "stopping"
```

`terminalStatus` is folded in to handle the case where the workspace pill says "compiling" but the underlying compiler hook hasn't ticked yet (race protection).

### 1.5 Render structure

```
w-72 panel:
  <header h-10>
    "{mode === "contract" ? "Contract Actions" : "Frontend Controls"}"

  <body p-5 space-y-7>

    Live Sync Section (shared, both modes):
      title + green pulse dot when connected
      [Sync to Sandbox] button — disabled if !isSandboxConnected
      hint text "Start sandbox to push local changes for execution"

    if mode === "contract":
      Compile Section:
        [Build Contract] button (states: build/compiling/success/failed via icons)
        WASM Binary card (when hasCompiledWasm) showing byte size

      Deploy Section:
        [TEST | MAIN] network toggle pill
        deployment step list (UPLOAD wasm → INSTANTIATE)
        [Deploy] button → opens <DeployDialog>
        Latest contract card (id, copy button, explorer link)
        Deployed Contracts list (each with bindings button)

    if mode === "frontend":
      Sandbox Section:
        [Start | Stop] sandbox button
        status pill (spawning / preview_starting / running / stopping / error)
```

### 1.6 Compile button

```tsx
<button onClick={onCompile} disabled={isCompiling} className={cn(
  "w-full h-11 ...border text-[13px] font-semibold",
  compilerStatus === "SUCCESS" && !isCompiling
    ? "bg-green-500/10 border-green-500/30 text-green-400"
    : compilerStatus === "ERROR" && !isCompiling
      ? "bg-red-500/10 border-red-500/30 text-red-400"
      : "bg-white/[0.05] border-white/[0.1] text-zinc-200 hover:bg-white/[0.08]"
)}>
  {isCompiling                      ? <Loader2 animate-spin/> :
   compilerStatus === "SUCCESS"     ? <CheckCircle2/>          :
   compilerStatus === "ERROR"       ? <AlertCircle/>           :
                                       <Play/>}
  <span>{
    isCompiling ? "Compiling..." :
    compilerStatus === "SUCCESS" ? "Build Success" :
    compilerStatus === "ERROR"   ? "Build Failed"  : "Build Contract"
  }</span>
</button>
```

Calls parent's `onCompile` → `Generate.handleCompile` (`Generate.tsx:1031-1090`):
1. `monacoSyncRef.current?.()` flushes Monaco → reducer state.
2. `transformFilesForBackend(contractFileContentsRef.current, activeContractName)`.
3. `dispatchContract({ type: "CLEAR_LOGS" })` + `stellarIDE.clearAllLogs()`.
4. `stellarIDE.compiler.compile(files)`.

### 1.7 Deploy flow

```
[Deploy] button → setShowDeployDialog(true)
   ▼
<DeployDialog isOpen={showDeployDialog} onConfirm={handleDeployConfirm}/>
   ▼
on confirm: parent's onDeploy = Generate.handleDeploy (Generate.tsx:1092-1124):
  if (!isWalletConnected)  return ADD_LOG "Please connect your wallet first"
  if (!hasCompiledWasm)    return ADD_LOG "Please compile the contract first"
  ADD_LOG "[DEPLOY] Starting deployment..."
  await stellarIDE.deployer.deploy()
```

### 1.8 Latest contract card

When `latestContractId`:
```tsx
<div className="rounded-xl bg-white/[0.02] border ...">
  <span>Contract ID</span>
  <code className="font-mono text-[10px] text-[#4ee06a]">{latestContractId.slice(0,10)}...{latestContractId.slice(-8)}</code>
  <button onClick={() => handleCopy(latestContractId)}><Copy/></button>
  {explorerUrl && <a href={explorerUrl} target="_blank"><ExternalLink/></a>}
  <button onClick={() => onGenerateBindings(latestContractId)}>Generate Bindings</button>
</div>
```

### 1.9 Network toggle

```tsx
<button onClick={() => onNetworkChange?.("testnet")} className={network === "testnet" ? "bg-zinc-800 text-zinc-100" : "text-zinc-600"}>TEST</button>
<button onClick={() => onNetworkChange?.("mainnet")} className={network === "mainnet" ? "bg-red-600/20 text-red-400" : "text-zinc-600"}>MAIN</button>
```

Mainnet shown red as a visual warning (real funds).

### 1.10 Sandbox section (frontend mode)

```
[Start | Stop] toggle:
  if !isSandboxActive  → onSpawnSandbox
  else                 → onStopSandbox
  disabled if isSandboxBooting || isSandboxStopping

Status pill:
  ● green pulse if isSandboxActive
  yellow if isSandboxBooting
  red if sandboxStatus === "error"
```

## 2. Agentic `AgentActionPanel.tsx` (~248 lines)

Renders step-by-step phase tracker driven by `useAgentState`.

### 2.1 Props (lines 19-24)

```ts
interface AgentActionPanelProps {
  isOpen: boolean;
  phaseGroups: PhaseGroup[];
  lastAction: StepEntry | null;
  onClearSession: () => void;
}
```

### 2.2 Sub-components

#### `relativeTime(timestamp)` (lines 26-31)
```ts
diff = (Date.now() - ts) / 1000
< 60   → `${diff}s ago`
< 3600 → `${Math.floor(diff/60)}m ago`
else   → `${Math.floor(diff/3600)}h ago`
```

#### `<StatusDot status>` (lines 33-45)
```
pending → bg-zinc-600
active  → bg-amber-400 animate-pulse
done    → bg-green-500
error   → bg-red-500
```

#### `<StepCard step>` (lines 47-145)

```ts
const { addMessage } = useChatContext();
const [expanded, setExpanded] = useState(step.status === "error");
const [copied, setCopied] = useState(false);

handleRepeat()  → addMessage({ role: "user", content: `Re-run: ${step.label}` })
handleCopy(text)→ navigator.clipboard.writeText(text); setCopied(true); setTimeout(... 2000)

isContractAddress = /^[A-Z0-9]{56}$/.test(step.summary)
```

Layout:
```
[CheckCircle2 (green) | AlertCircle (red)] [step.label] [Clock + relativeTime] [chevron if error]

if isContractAddress:
  <code text-[#4ee06a]>{summary.slice(0,10)}...{summary.slice(-8)}</code> [Copy]
else:
  <span text-zinc-500>{summary}</span>

[Repeat] button (RotateCcw + label)

if status === "error" && expanded:
  <p text-red-400 font-mono>{errorMessage}</p>
  [Retry] button
```

Stellar contract address detection: `[A-Z0-9]{56}` matches Soroban contract IDs. Renders truncated with copy button.

#### `<PhaseSection group>` (lines 147-189)

```ts
const [isOpen, setIsOpen] = useState(group.status === "active" || group.status === "error");
const isDimmed = group.status === "pending";
```

Renders:
```
[StatusDot] [LABEL UPPERCASE] [count chip if steps.length > 0] [Loader2 if active] [chevron if open & has steps]

if isOpen && steps.length > 0:
  <div pl-4 space-y-1.5>
    {steps.map(s => <StepCard step={s}/>)}
  </div>
```

Pending phase: 40% opacity, click disabled.

### 2.3 Top-level render (lines 191-247)

```tsx
if (!isOpen) return null;
const allDone = phaseGroups.every(g => g.status === "done" || g.status === "pending");
const hasAnyActivity = phaseGroups.some(g => g.steps.length > 0);

<div className="w-72 border-l bg-zinc-900/30 flex flex-col shrink-0 overflow-hidden">
  <div h-10 header>
    "AGENT ACTIVITY"
    {hasAnyActivity && <Trash2 onClick={onClearSession}/>}
  </div>

  {allDone && lastAction && (
    <div className="bg-green-500/5 border border-green-900/40">
      [CheckCircle2] Last: {lastAction.label} {relativeTime(lastAction.timestamp)}
    </div>
  )}

  {!hasAnyActivity && (
    <empty state>
      [Loader2] "Waiting for agent activity..."
    </empty>
  )}

  {hasAnyActivity && (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {phaseGroups.map(g => <PhaseSection group={g}/>)}
    </div>
  )}
</div>
```

`useChatContext` is consumed inside `<StepCard>` only — `addMessage` for the Repeat button. Means `<AgentActionPanel>` MUST live inside a `<ChatProvider>`. (`Generate.tsx` mounts `<ChatProvider>` near root.)

### 2.4 How signals → panel

See [12-sandbox-and-agent.md](./12-sandbox-and-agent.md) for the `processSignal` reducer in detail. Summary:

- `agent.thinking { phase: "planning" }` → planning becomes active.
- `agent.tool_call { tool }` → `TOOL_PHASE_MAP[tool]` becomes active; `_pendingCall` stashed on the phase.
- `agent.tool_result { success }` → push `StepEntry` (success or error). Phase status flips error if !success.
- `agent.done` → all active phases → done. Synthetic "Agent finished" step in planning if it was empty.
- `agent.error` → all active phases → error.

### 2.5 What junior dev should fix here

| Issue                                    | Location                                                                  |
|------------------------------------------|---------------------------------------------------------------------------|
| New tool name shows wrong phase          | `useAgentState.ts:68-84` `TOOL_PHASE_MAP`. Add entry.                     |
| Step summary unhelpful                   | `useAgentState.ts:112-122` `makeSummary(tool, args)`. Add a case.         |
| Need a 6th phase                         | `useAgentState.ts:49` `PhaseKey` union + `INITIAL_PHASE_GROUPS`.          |
| Repeat button does nothing useful        | `StepCard.handleRepeat` adds a chat message; sandbox doesn't see it. Wire to `runtime.thread.append` + `sandbox.sendChatMessage`. |
| Want clickable contract address          | Already done for `[A-Z0-9]{56}` summaries. To add explorer-link button, embed `<a href={explorerUrlFor(summary, network)}>`. |
