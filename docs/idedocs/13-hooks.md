# 13 — Hooks (`hooks/`) — Deep Dive

Every hook in `hooks/`. What it owns, what it returns, where it's mounted.

---

## 1. `useStellarIDE.ts` — aggregator

Single import for the page (`Generate.tsx:711`). Composes 4 child hooks into one object.

```ts
export function useStellarIDE() {
  const wallet   = useWallet();
  const compiler = useCompiler();
  const deployer = useDeployer();
  const sandbox  = useSandbox();

  const allLogs = useMemo(() => [
    ...wallet.logs, ...compiler.logs, ...deployer.logs, ...sandbox.logs
  ], [wallet.logs, compiler.logs, deployer.logs, sandbox.logs]);

  const compileContract = useCallback(
    (files: CompileFile[]) => compiler.compile(files),
    [compiler]
  );

  const deployContract = useCallback(async () => {
    if (!wallet.address)     return console.error("Cannot deploy: wallet not connected");
    if (!compiler.wasmHex)   return console.error("Cannot deploy: no compiled WASM");
    await deployer.deploy(compiler.wasmHex, wallet.address, wallet.sign);
  }, [wallet.address, wallet.sign, compiler.wasmHex, deployer]);

  const generateBindings = useCallback((contractId, onSuccess?) => {
    if (!sandbox.isConnected) return console.error("Cannot generate bindings: sandbox not connected");
    sandbox.setOnBindingsResponse(response => {
      if (response.success && onSuccess && response.editor?.changes) {
        onSuccess(response.editor.changes);
      }
    });
    sandbox.generateBindings(contractId, deployer.network);
  }, [sandbox, deployer.network]);

  const resetAll     = () => { compiler.reset(); deployer.reset(); sandbox.reset(); };
  const clearAllLogs = () => { wallet.clearLogs(); compiler.clearLogs(); deployer.clearLogs(); sandbox.clearLogs(); };

  return {
    wallet:    { address, status, connect, disconnect, error },
    compiler:  { status, wasmHex, compile: compileContract, reset },
    deployer:  { status, contractId, wasmHash, network, setNetwork, explorerUrl, deploy: deployContract, reset },
    sandbox:   { ...UseSandboxReturn... + generateBindings overridden },
    allLogs, resetAll, clearAllLogs,

    isWalletConnected:    wallet.status === "connected",
    isCompiling:          compiler.status === "COMPILING",
    isDeploying:          deployer.status === "UPLOADING" || deployer.status === "INSTANTIATING",
    hasCompiledWasm:      !!compiler.wasmHex,
    hasDeployedContract:  !!deployer.contractId,
    isSandboxRunning:     sandbox.status === "running" || sandbox.status === "preview_starting",
    isSandboxConnected:   sandbox.isConnected,
  };
}
export type StellarIDEHook = ReturnType<typeof useStellarIDE>;
```

The verbose console-log block in the real `generateBindings` (lines 60-128) prints every step of the call and response — useful trace for "did the response handler fire?" debugging.

## 2. `useWallet.ts` — Stellar wallet

Owns:
```ts
address: string | null
status:  "disconnected" | "connecting" | "connected" | "error"
error:   string | null
logs:    string[]
```

Methods:
```ts
connect(): Promise<void>          // open wallet adapter (Freighter / Albedo / xBull)
disconnect(): void
sign(xdr: string): Promise<string> // sign Stellar TX, return signed XDR
clearLogs(): void
```

Used by `deployer.deploy(wasmHex, address, sign)` for the upload-WASM and instantiate-contract steps.

## 3. `useCompiler.ts` — Soroban compiler

Owns:
```ts
status: "IDLE" | "QUEUED" | "COMPILING" | "SUCCESS" | "ERROR"
wasmHex: string | null
logs: string[]

compile(files: CompileFile[]): void
reset(): void
clearLogs(): void

interface CompileFile { path: string; content: string }
```

`files` come from `lib/fileTransform.transformFilesForBackend(fileContents, activeContractName)`:

```ts
export function transformFilesForBackend(fileContents, activeContractName): BackendFile[] {
  const files = [];
  for (const [path, content] of Object.entries(fileContents)) {
    if (!path.includes("contracts/") && path !== "Cargo.toml") continue;  // only contract files
    files.push({ path: path.startsWith("/") ? path.slice(1) : path, content });
  }
  if (!files.some(f => f.path === "Cargo.toml")) {
    files.push({ path: "Cargo.toml", content: generateRootCargoToml(activeContractName) });
  }
  return files;
}
```

`generateRootCargoToml(name)` (`lib/fileTransform.ts:45`) emits a workspace manifest with `members: ["contracts/${name}"]` and pinned `stellar-tokens=0.5.0`/`stellar-access=0.5.0`/`stellar-contract-utils=0.5.0`/`stellar-macros=0.5.0` workspace deps. Release profile: `opt-level="z"`, `lto=true`, `panic="abort"`, `codegen-units=1`, `strip="symbols"` (smaller WASM).

`generateContractCargoToml(name)` (line 74) emits the contract crate manifest:
```toml
[package] name="${name}", version="0.0.0", edition="2021"
[lib] crate-type=["cdylib"]
[dependencies] soroban-sdk = { workspace = true }
```

`getActiveContractName(activeFile)` (line 116):
```ts
match = activeFile?.match(/contracts\/([^/]+)/)
return match?.[1] ?? "hello_world"
```

## 4. `useDeployer.ts` — Stellar deployment

Owns:
```ts
status: "IDLE" | "UPLOADING" | "INSTANTIATING" | "SUCCESS" | "ERROR"
contractId: string | null
wasmHash:   string | null
network: "testnet" | "mainnet"
explorerUrl: string | null    // Stellar Expert URL after success
logs: string[]

deploy(wasmHex, address, sign): Promise<void>
setNetwork(net): void
reset(): void
clearLogs(): void
```

Two-stage:
1. UPLOADING — upload WASM to Stellar (returns wasmHash).
2. INSTANTIATING — create contract instance (returns contractId).

`explorerUrl` is computed once per success, e.g. `https://stellar.expert/explorer/testnet/contract/${contractId}`.

Network change propagates so `generateBindings` knows which network to query.

## 5. `useSandbox.ts`

Full surface: see [12-sandbox-and-agent.md](./12-sandbox-and-agent.md). Internally instantiates `useAgentState()` and exposes it as `sandbox.agentState` (the second instance is created at the page level for `AgentActionPanel` — be aware of dual sources during refactors).

Current source is a stub (`status: "idle"`, all methods `noop`). The TYPE surface is the contract.

## 6. `useAgentState.ts`

See [12-sandbox-and-agent.md](./12-sandbox-and-agent.md) for full state machine, `TOOL_PHASE_MAP`, `TOOL_LABELS`, `makeSummary`, signal-by-signal reducer behavior.

Returns:
```ts
{
  status, currentTool, currentFile,
  retryCount, maxRetries (=3), retryReason,
  tokenUsage, model, lastError, isLoading,
  processSignal(signal), reset(), clearSession(), setDisconnected(_msg),
  phaseGroups: PhaseGroup[], lastAction: StepEntry | null
}
```

Note: `clearSession = reset` (line 265). `setDisconnected` is currently a noop (line 267).

## 7. `useBuilderPass.ts`

```ts
import { useBuilderPassContext } from "@/contexts/BuilderPassContext";
export function useBuilderPass() { return useBuilderPassContext(); }
```

Tiny wrapper over the context — keeps consumer ergonomics consistent with other `useX` hooks. Returns the entitlement state (`hasPass`, `expiresAt?`, etc., shape defined by `BuilderPassContext`).

## 8. `useSupabaseSession.ts`

Returns the Supabase auth session. Used to associate saved projects with a user account.

## 9. `useSpeechRecognition.ts`

Wraps `react-speech-recognition` (~3.2k file). Exposes:

```ts
{
  isListening: boolean,
  transcript: string,
  start(): void,
  stop(): void,
  reset(): void,
  supported: boolean,
}
```

Currently called from chat composer for voice input (commented in/out depending on UX iteration). Requires `regenerator-runtime` polyfill (added in `package.json`).

## 10. `use-toast.ts`

shadcn-style toast hook. Pattern:

```ts
const { toast } = useToast();
toast({
  title: "Saved",
  description: "Project saved successfully.",
  variant: "default" | "destructive",
});
```

Internally maintains a queue + dispatcher. Render surface is `<Toaster/>` mounted in `app/layout.tsx`.

## 11. `use-mobile.tsx`

```ts
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);  // 767
    const onChange = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return !!isMobile;
}
```

Used by landing components for layout breakpoints. The IDE itself is desktop-only.

## 12. Hook composition and rules

- All hooks live at module top-level inside `Generate.tsx` — no conditional `useReducer` / `useStellarIDE` calls.
- `stellarIDE.allLogs` re-derives via `useMemo` whenever any child `logs` array changes. Avoids re-allocation on unrelated re-renders.
- `useCallback` is used liberally because the resulting fns are passed into many children as props. Avoids prop-identity-driven re-renders downstream.
- For "fresh state in a callback that wasn't re-created" use a ref (see `contractFileContentsRef` pattern in `Generate.tsx:761-771`). This is intentional and idiomatic; don't try to "fix" it by adding deps.
