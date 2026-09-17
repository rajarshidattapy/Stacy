# 17 — Glossary & Quick Lookup (Deep Dive)

---

## 1. Acronyms / jargon

| Term                   | Means                                                              |
|------------------------|--------------------------------------------------------------------|
| **Soroban**            | Stellar's smart contract platform (Rust → WASM).                   |
| **Stellar Expert**     | Block explorer; URL surfaced as `explorerUrl` after deploy.        |
| **WASM hex**           | Compiled WebAssembly module, hex-encoded for upload.               |
| **Bindings**           | TypeScript client code generated from a deployed contract.        |
| **Sandbox**            | Remote container running `next dev` + cargo / soroban CLIs.        |
| **Builder Pass**       | Premium tier (`useBuilderPass`).                                   |
| **assistant-ui**       | `@assistant-ui/react` headless chat primitives.                    |
| **AI SDK**             | Vercel `ai` package — provider-agnostic streaming.                 |
| **Open VSX**           | OSS extension marketplace (`open-vsx.org`).                        |
| **VSIX**               | VS Code extension package (zip archive).                           |
| **NLS**                | National Language Support — `package.nls.json` localization keys.  |
| **JSX runtime**        | The `react/jsx-runtime` module new JSX transform compiles into.    |
| **Memento**            | VS Code-style key-value storage on `ExtensionContext`.             |
| **Activation event**   | A trigger string in `package.json` that wakes an extension (`onCommand:foo`, `onLanguage:rust`, `onStartupFinished`, `*`). |
| **Phase group**        | One of 5 buckets in `AgentActionPanel`: planning → building → testing → deploying → integrating. |
| **Step entry**         | A single tool result inside a phase group.                          |
| **Pending change**     | An AI-generated file diff queued in `pendingAIChanges` until user syncs/previews. |
| **Resolved mode**      | Chat target; `targetMode === "auto" ? ideMode : targetMode`.        |
| **Force-set model**    | Direct Monaco `model.setValue(content)` bypass for closed-file AI updates. |

## 2. File quick-lookup

| Need to…                                          | Open                                                |
|---------------------------------------------------|-----------------------------------------------------|
| Tweak the IDE shell layout                        | `components/ide/IdeWorkspace.tsx`                   |
| Add a reducer action / mutate workspace state     | `components/generate/Generate.tsx` (`workspaceReducer`) |
| Touch the editor or theme behavior                | `components/ide/IdeWorkspace.tsx` + `lib/monacoTheme.ts` |
| Modify chat UI                                    | `components/assistant-ui/thread-ide.tsx`            |
| Modify chat backend                               | `app/api/chat/route.ts`                             |
| Add buttons to the manual right panel             | `components/ide/ActionPanel.tsx`                    |
| Show new agent phase information                  | `components/ide/AgentActionPanel.tsx` + `hooks/useAgentState.ts` |
| Add file tree behavior                            | `components/ide/FileExplorer.tsx` + `lib/fileTreeUtils.ts` |
| Cross-file find/replace                           | `components/ide/SearchPanel.tsx`                    |
| Build / list extensions                           | `app/api/extensions/route.ts`, `extension-system/*` |
| Run a marketplace search                          | `extension-system/registry/vscode-marketplace-client.ts` |
| Add a Monaco theme                                | `lib/monacoThemes/<name>.json` + `themelist.json`   |
| Wallet connect flow                               | `hooks/useWallet.ts`                                |
| Compile / deploy logic                            | `hooks/useCompiler.ts` + `hooks/useDeployer.ts`     |
| Sandbox API surface                               | `hooks/useSandbox.ts`                               |
| Top-level page orchestration                      | `components/generate/Generate.tsx`                  |
| Top bar (mode toggles, wallet, project menu)      | `components/ide/GlobalTopBar.tsx`                   |
| Header (file search, preview toggle, env)         | `components/ide/IdeHeader.tsx`                      |
| Logs / terminal                                   | `components/ide/LogsDock.tsx`                       |
| Editor tabs                                       | `components/ide/EditorTabs.tsx`                     |
| Empty state when no file open                     | `components/ide/EmptyEditorView.tsx`                |
| Code selection AI popup                           | `components/ui/CodeSelectionPopup.tsx`              |
| Save project dialog                               | `components/ide/SaveProjectDialog.tsx`              |
| Projects list modal                               | `components/ide/ProjectsModal.tsx`                  |
| Versions modal                                    | `components/ide/VersionsModal.tsx`                  |
| Env config modal                                  | `components/ide/EnvConfigModal.tsx`                 |
| Pricing / Builder Pass modal                      | `components/ide/PricingModal.tsx`                   |
| Wallet first-time popup                           | `components/ide/WalletGuidePopup.tsx`               |
| Deploy confirmation dialog                        | `components/ide/DeployDialog.tsx`                   |
| Account settings dialog (chat side)               | `components/layout/AccountsDialog.tsx`              |
| Home sidebar (project menu)                       | `components/ide/HomeSidebar.tsx`                    |
| Chat composer / messages legacy                   | `components/ide/chat/*`                             |
| Markdown rendering for chat                       | `components/assistant-ui/markdown-text.tsx`         |
| Reasoning blocks                                  | `components/assistant-ui/reasoning.tsx`             |
| Citations                                         | `components/assistant-ui/sources.tsx`               |
| Tool fallback UI                                  | `components/assistant-ui/tool-fallback.tsx`         |
| Attachments                                       | `components/assistant-ui/attachment.tsx`            |
| File tree mutations                               | `lib/fileTreeUtils.ts`                              |
| Cargo.toml generators / file backend transform    | `lib/fileTransform.ts`                              |
| Stub detector                                     | `lib/stubDetector.ts`                               |
| Format file tree as text                          | `lib/fileTreeFormatter.ts`                          |
| LLMs.txt context file                             | `lib/llms.txt`                                      |
| Stella RAG glue                                   | `lib/stellaRAG.ts`                                  |
| Builder Pass plumbing                             | `lib/builder-pass/*`                                |

## 3. Event names (window CustomEvents)

| Event                                             | Dispatched by                            | Listened to by             |
|---------------------------------------------------|------------------------------------------|----------------------------|
| `OPEN_FILE_SEARCH_EVENT` = `"stacy:open-file-search"` | `IdeWorkspace.openFileSearch()` (Cmd+Shift+P) | `IdeHeader`        |
| `MONACO_THEME_CHANGE_EVENT` = `"stacy:monaco-theme-change"` | `ExtensionsPanel` "Set Color Theme" | `IdeWorkspace`         |

## 4. localStorage keys

| Key                                         | Stores                              |
|---------------------------------------------|-------------------------------------|
| `stacy.installed-extension-ids`             | Set of installed extension ids      |
| `stacy.monaco-theme`                        | Selected Monaco theme name          |

(Add new keys here when adding persistence.)

## 5. Status pill values

| Domain      | Field                  | Values                                                   |
|-------------|------------------------|----------------------------------------------------------|
| Compiler    | `compilerStatus`       | `IDLE \| QUEUED \| COMPILING \| SUCCESS \| ERROR`        |
| Deployer    | `deployerStatus`       | `IDLE \| UPLOADING \| INSTANTIATING \| SUCCESS \| ERROR` |
| Sandbox     | `sandboxStatus`        | `idle \| spawning \| preview_starting \| running \| stopping \| error` |
| Bindings    | `bindingsStatus`       | `idle \| generating \| success \| error`                 |
| Terminal    | `terminalStatus`       | `idle \| compiling \| deploying \| success \| error`     |
| Agent       | `AgentStatus` (state)  | `idle \| thinking \| executing \| validating \| retrying \| error \| done` |
| Agent (sandbox conn) | `AgentStatus` (sandbox) | `disconnected \| connecting \| connected`     |
| Wallet      | `wallet.status`        | `disconnected \| connecting \| connected \| error`       |

## 6. Phase keys (`PhaseKey`)

```
"planning"   → "building"   → "testing"   → "deploying"   → "integrating"
```

Each `PhaseGroup.status`: `pending | active | done | error`.

## 7. Reducer action types (full list)

```
LOAD_PROJECT       RESET_IDE
OPEN_FILE          CLOSE_FILE
UPDATE_FILE        ADD_LOG          CLEAR_LOGS         SET_TERMINAL_STATUS
TOGGLE_EXPLORER    TOGGLE_ACTION_PANEL    TOGGLE_TERMINAL    TOGGLE_PREVIEW
ADD_BINDINGS_FILE  ADD_FILE         ADD_FOLDER         RENAME_FILE       DELETE_FILE
SYNC_FILE_TREE     SYNC_FILE_CONTENT    MARK_FILE_LOADING
```

## 8. Agent signal types (full list)

```
agent.idle
agent.thinking { phase: "planning" | "executing" | "validating" | "retrying" }
agent.tool_call { tool, args, iteration }
agent.tool_result { tool, success, duration_ms }
agent.retry { attempt, reason, failure_type }
agent.stream_chunk { content }
agent.done { message, file_changes, model, tokens }
agent.error { message, code, recoverable }
sandbox.starting
sandbox.ready
sandbox.crashed { reason }
```

## 9. Tool names known to `useAgentState`

```
compile_contract       → building
write_file             → building
edit_file              → building
create_file            → building
delete_file            → building
run_command            → building
run_tests              → testing
test_contract          → testing
validate_contract      → testing
deploy_contract        → deploying
upload_wasm            → deploying
instantiate_contract   → deploying
generate_bindings      → integrating
configure_contract     → integrating
update_frontend_config → integrating
```

Unknown tool → defaults to `building`.

## 10. Path conventions

| Path pattern                 | Meaning                                              |
|------------------------------|------------------------------------------------------|
| `Cargo.toml` (root)          | Soroban workspace manifest. Contract reducer.        |
| `contracts/<name>/Cargo.toml`| Contract crate manifest. Contract reducer.           |
| `contracts/<name>/src/lib.rs`| Contract Rust source. Contract reducer.              |
| `frontend/...`               | Next.js frontend. Frontend reducer.                  |
| Anything else                | Frontend reducer (default).                          |

## 11. Log prefixes recognized by router

| Prefix                                  | Routed to     | Notes                            |
|-----------------------------------------|---------------|----------------------------------|
| `[cargo]`, `[compile]`, `[deploy]`, `[bindings]` | Contract terminal | Always contract-scoped.    |
| `[next]`                                | Dropped       | npm dev noise.                   |
| `[cmd]`, `[sync]`, `[project]`, default | Active mode terminal | User-context.            |

## 12. Shape memory aid

```
WorkspaceState
├── mode
├── fileTree (FileNode[])
├── openFiles[]
├── activeFile
├── recentFiles[]
├── fileContents { path: content }
├── terminalLogs[]
├── terminalStatus
└── ui { isFileExplorerOpen, isActionPanelOpen, isTerminalOpen, isPreviewMode }

PhaseGroup × 5
  └─ planning → building → testing → deploying → integrating
       └─ steps[] (StepEntry: tool, label, summary, status, timestamp)

ChatContext
├── targetMode      "auto" | "contract" | "frontend"
├── resolvedMode    IdeMode
├── activeFilePath
├── selection       { startLine, endLine, selectedText }
└── intent          "general" | "fix" | "explain" | "optimize" | "debug"

AgentSignal (discriminated union of 11 shapes)
```

## 13. Keyboard shortcuts

| Shortcut                     | Action                                    | Owner             |
|------------------------------|-------------------------------------------|-------------------|
| `Cmd/Ctrl + P`               | Focus file search in IdeHeader            | `IdeHeader`       |
| `Cmd/Ctrl + Shift + P`       | Same (command palette = file search today)| `IdeWorkspace`    |
| `Cmd/Ctrl + Shift + F`       | Open Search panel in sidebar              | `IdeWorkspace`    |
| `Cmd/Ctrl + \``              | Toggle terminal                           | `IdeHeader`       |
| `Cmd/Ctrl + F`               | Monaco built-in find                      | `IdeWorkspace` `editor.addCommand` |
| `Esc`                        | Close file search                         | `IdeHeader`       |
| `↑↓` (in search)             | Navigate file results                     | `IdeHeader`       |
| `Enter` (in search)          | Open selected file                        | `IdeHeader`       |
| `Enter` (in inline rename)   | Confirm                                   | `FileExplorer`    |
| `Esc`  (in inline rename)    | Cancel                                    | `FileExplorer`    |

## 14. Where each major concept is defined

| Concept                                | Defined in                                                 |
|----------------------------------------|------------------------------------------------------------|
| `IdeMode`, `WorkspaceState`, `FileNode`, `ChatContext`, `DeployedContract` | `types/ide.ts`              |
| `Action` union, `workspaceReducer`     | `components/generate/Generate.tsx`                          |
| `AgentSignal`, `PhaseGroup`, `PhaseKey`, `StepEntry` | `hooks/useAgentState.ts`                       |
| `ChatTargetMode`                       | `types/ide.ts`                                              |
| `MonacoThemeName`, theme constants     | `lib/monacoTheme.ts`                                        |
| `SandboxStatus`, `AgentStatus`, `BindingsStatus`, `EditorChange`, `ChatResponse`, `BindingsResponse` | `hooks/useSandbox.ts` |
| Extension types (`ExtensionManifest`, `ExtensionContext`, `Memento`, `Disposable`, `Position`, `Range`, `Uri`) | `extension-system/vscode-api/types.ts` |
| `IDEExtension`                         | `components/ide/ExtensionsPanel.tsx`                        |
| `BackendFile`, `CompileFile`           | `lib/fileTransform.ts`, `hooks/useCompiler.ts`              |

## 15. Common abbreviations in code

| In code              | Means                          |
|----------------------|--------------------------------|
| `nls`                | National Language Support      |
| `pkg`                | package.json contents          |
| `cwd`                | current working directory      |
| `xdr`                | Stellar transaction encoding   |
| `cli`                | command-line interface         |
| `ide` / `IDE`        | this app                        |
| `vsx`                | VS Code Extension              |
| `id`                 | extension id (`publisher.name`) |
| `sel`                | Monaco selection                |
| `sb`                 | sandbox                        |
