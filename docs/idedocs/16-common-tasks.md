# 16 — Common Tasks (Junior Recipe Book — Deep Dive)

"If I want to fix / add X, where do I look first?"

---

## 1. Add a new reducer action (e.g., duplicate file)

1. **Type** — extend the `Action` union in `Generate.tsx:380-421`:
   ```ts
   | { type: "DUPLICATE_FILE"; payload: { sourcePath: string; targetPath: string } }
   ```
2. **Reducer case** — add to `workspaceReducer` in `Generate.tsx`:
   ```ts
   case "DUPLICATE_FILE": {
     const { sourcePath, targetPath } = action.payload;
     const sourceContent = state.fileContents[sourcePath];
     if (sourceContent === undefined) return state;
     const newTree = ensureFilePathInTree(state.fileTree, targetPath);
     return {
       ...state,
       fileTree: newTree,
       fileContents: { ...state.fileContents, [targetPath]: sourceContent },
       openFiles: state.openFiles.includes(targetPath) ? state.openFiles : [...state.openFiles, targetPath],
       activeFile: targetPath,
     };
   }
   ```
3. **Helper** — extend `lib/fileTreeUtils.ts` if you need a tree-only helper.
4. **Caller** — add to `FileExplorer.<ContextMenu>` and prop-drill `onDuplicate`.
5. **Type updates** — none needed in `types/ide.ts` unless changing `WorkspaceState` shape.

## 2. Add a new sidebar panel (e.g., Source Control)

1. **Extend the union** in `components/ide/ActivityBar.tsx`:
   ```ts
   export type SidebarPanel = "explorer" | "search" | "extensions" | "git" | null;
   ```
2. **Add icon button** in `ActivityBar`:
   ```tsx
   <button onClick={() => togglePanel("git")} title="Source Control"
     className={cn("h-full px-2.5 ...", activePanel === "git" ? "text-zinc-200" : "text-zinc-500 hover:text-zinc-400")}>
     <GitBranch className="w-[18px] h-[18px]" strokeWidth={1.5}/>
     {activePanel === "git" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-200 rounded-t"/>}
   </button>
   ```
3. **Create `components/ide/GitPanel.tsx`** — model after `SearchPanel`.
4. **Mount** in `IdeWorkspace.tsx:891-905`:
   ```tsx
   {activeSidebarPanel === "git" && <GitPanel files={workspace.fileTree} fileContents={workspace.fileContents} dispatch={dispatch}/>}
   ```

## 3. Add a new chat message part type

1. **Server** — emit a custom part via `streamText({ tools, ... })` or extend `convertToModelMessages` if needed.
2. **Client** — make a React component:
   ```tsx
   function CodeDiffPart({ part }: { part: { args: { path, oldCode, newCode } } }) { ... }
   ```
3. **Wire into `MessagePrimitive.Parts`** in `components/assistant-ui/thread-ide.tsx:175-183`:
   ```tsx
   <MessagePrimitive.Parts components={{
     Text: MarkdownText,
     tools: { code_diff: CodeDiffPart, Fallback: ToolFallback },
     Reasoning, ReasoningGroup,
     Source: Sources,
   }}/>
   ```

## 4. Swap the AI model / provider

`app/api/chat/route.ts`:

```ts
// Different OpenRouter model:
streamText({ model: openrouter("anthropic/claude-3.5-sonnet"), messages });

// Different provider:
import { createGoogleGenerativeAI } from "@ai-sdk/google";
const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY });
streamText({ model: google("gemini-1.5-pro-latest"), messages });
```

Set the env var in `.env.local` and restart dev server.

## 5. Apply AI-generated file changes

```
1. Agent fires agent.done with file_changes: AgentFileChange[]
2. Generate.tsx queues into pendingAIChanges (state)
3. On user click "Sync to sandbox" or "Preview" or "Apply":
   handleApplyEditorChanges(changes):
     for (const change of changes):
       if change.action === "delete":
         dispatch({ type: "DELETE_FILE", payload: { path: change.path } });
       else:
         dispatch({ type: "UPDATE_FILE", payload: { path: change.path, content: change.content, source: "system" } });
         if (file not in workspace.openFiles):
           forceModelContentRef.current?.(change.path, change.content);
     setPendingAIChanges([]);
4. previewKey++ → iframe reload
```

## 6. Wire a code action (Explain / Fix) to chat

1. User selects code → Monaco `onDidChangeCursorSelection` (`IdeWorkspace.tsx:413-493`) → popup visible.
2. User clicks button → `IdeWorkspace.handleAIAction(action)` → `props.onCodeAction(action, sel)`.
3. `Generate.tsx:1003-1029` — `setCodeSelection({ ...sel, intent })`. After 2 s, intent cleared.
4. `ChatContextStrip` (chat panel) renders chip showing intent + selection preview.
5. Auto-send: add an effect inside `ChatPanelInner` that watches `chatContext.intent`:
   ```tsx
   useEffect(() => {
     if (!chatContext.intent || chatContext.intent === "general") return;
     const text = `${chatContext.intent.toUpperCase()}:\n\`\`\`\n${chatContext.selection?.selectedText}\n\`\`\``;
     runtime.thread.append({ role: "user", content: text });
   }, [chatContext.intent]);
   ```

## 7. Add a new Monaco theme

1. Drop a JSON file into `lib/monacoThemes/<theme-id>.json`:
   ```json
   {
     "base": "vs-dark",
     "inherit": true,
     "rules": [
       { "token": "keyword", "foreground": "ff79c6", "fontStyle": "bold" },
       { "token": "string",  "foreground": "f1fa8c" }
     ],
     "colors": {
       "editor.background":              "#282a36",
       "editor.foreground":              "#f8f8f2",
       "editor.selectionBackground":     "#44475a",
       "editor.lineHighlightBackground": "#44475a"
     }
   }
   ```
2. Register in `lib/monacoThemes/themelist.json`:
   ```json
   { "<theme-id>": "Theme Display Name", ... }
   ```
3. `/api/extensions` auto-discovers it on next request and renders an extension card with a generated SVG icon.
4. User opens Extensions panel → finds the theme → clicks "Set Color Theme" → IDE re-renders Monaco with new theme.

## 8. Add a new VS Code-style command from a local extension

Create `components/ide/extensions/<your-folder>/`:

`package.json`:
```json
{
  "name": "my-extension",
  "publisher": "you",
  "displayName": "My Extension",
  "version": "0.0.1",
  "main": "./extension.js",
  "activationEvents": ["onCommand:my.cmd"],
  "contributes": {}
}
```

`extension.js`:
```js
const vscode = require("vscode");
function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("my.cmd", () => {
      vscode.window.showInformationMessage("Hello from my-extension!");
    })
  );
}
function deactivate() {}
module.exports = { activate, deactivate };
```

The extension shows up in the Extensions panel via `/api/extensions`. Today, **extensions don't auto-execute on the client** — you'd need to wire `ExtensionHost.registerExtension({ manifest, extensionUri, modulePath })` and invoke `activateExtension(id)` somewhere in the IDE bootstrap. That bootstrap glue is the most likely junior-extend surface.

## 9. Persist a project

1. User clicks Save → `<SaveProjectDialog>` opens (`Generate.tsx`).
2. On confirm → `handleSaveProject(name)`:
   ```ts
   setIsSaving(true);
   const projectData = {
     name,
     contract_state: contractState,
     frontend_state: frontendState,
     ide_mode: ideMode,
     interaction_mode: interactionMode,
     network: stellarIDE.deployer.network,
   };
   // POST to backend (Supabase) — implementation in saveProject helper
   const saved = await saveProject(projectData, currentProjectId);
   setCurrentProjectId(saved.id);
   setCurrentProjectName(saved.name);
   setLastSavedAt(saved.updated_at);
   setIsSaving(false);
   ```
3. Loading: `<ProjectsModal>` → user picks → `handleLoadProject(project)`:
   ```ts
   dispatchContract({ type: "LOAD_PROJECT", payload: project.contract_state });
   dispatchFrontend({ type: "LOAD_PROJECT", payload: project.frontend_state });
   if (nextContractActive) dispatchContract({ type: "OPEN_FILE", payload: nextContractActive });
   if (nextFrontendActive) dispatchFrontend({ type: "OPEN_FILE", payload: nextFrontendActive });
   setProjectSessionKey(k => k + 1);   // forces Monaco remount
   ```

## 10. Debug "AI changes not showing in editor"

Order of suspicion:

1. **Did the change come back?** — Console in `setOnChatResponse` / `setOnBindingsResponse` handlers. If silent, the transport in `useSandbox` isn't forwarding.
2. **Did `pendingAIChanges` get appended?** — `console.log` in the queueing effect.
3. **Was `handleApplyEditorChanges` called?** — Only fires on user click (Sync/Preview).
4. **Is the file open?** — If yes → `value` prop swap should redraw on next render. If no → `forceSetModelContent` must run. Verify ref attached:
   ```ts
   useEffect(() => { onForceModelContentReady?.(forceSetModelContent); }, [...]);
   ```
5. **Monaco model search**:
   ```ts
   monacoRef.current.editor.getModels().find(m => {
     const uriStr = m.uri.toString();
     return uriStr.endsWith(path) || uriStr.includes(path);
   });
   ```
   If returns undefined, the path key shape doesn't match Monaco's URI shape. Console-log all model URIs to compare.
6. **Disposed model**: `model.isDisposed()` guard in `forceSetModelContent`.

## 11. Debug "preview iframe shows stale content"

1. **Did `hasPendingChanges` flip false→true→false?** Trace via React DevTools or a `useEffect` log on `hasPendingChanges`.
2. **Did the sandbox actually accept the writes?** Inspect `[cmd]`/`[sync]` logs in LogDock.
3. **Manual fix**: click in-iframe Refresh button → `setPreviewKey(k => k + 1)`.
4. **Cache-busting**: if iframe caches aggressively, append `?t=${Date.now()}` to the src URL.

## 12. Debug "global Cmd+Shift+P does nothing"

1. **Is the IDE focused?** The keydown listener attaches to `document`, but if focus is in an iframe, events stop there.
2. **`OPEN_FILE_SEARCH_EVENT` listener attached?** `IdeHeader.tsx:186-194`:
   ```ts
   useEffect(() => {
     const handleOpenSearch = () => { inputRef.current?.focus(); setIsSearchOpen(true); };
     window.addEventListener(OPEN_FILE_SEARCH_EVENT, handleOpenSearch);
     return () => window.removeEventListener(OPEN_FILE_SEARCH_EVENT, handleOpenSearch);
   }, []);
   ```
3. **Modal stealing focus?** A `<Dialog>` with `e.preventDefault()` on outer keydown can swallow it. Inspect.

## 13. Add an ESLint rule

`package.json` has `"lint": "eslint ."`. Add `eslint.config.js` (Next 16 uses flat config):

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.recommended,
  { rules: { "no-console": ["warn"], "react-hooks/exhaustive-deps": "warn" } },
];
```

Hook into CI by adding `bun run lint` as a pre-deploy step.

## 14. Run locally

```bash
bun install
echo "OPENROUTER_API_KEY=sk-or-..." > .env.local
bun run dev
# http://localhost:3000
# IDE at /generate
# IDE in agentic mode: /generate?interactionMode=agentic
```

## 15. Add a new tool that the agent can call

Server side (`app/api/chat/route.ts`):

```ts
import { tool } from "ai";
import { z } from "zod";

streamText({
  model: openrouter("anthropic/claude-3.5-sonnet"),
  messages,
  tools: {
    write_file: tool({
      description: "Write or overwrite a file in the workspace",
      parameters: z.object({
        path: z.string().describe("Workspace-relative path"),
        content: z.string(),
      }),
      execute: async ({ path, content }) => {
        // server-side action; you'd typically forward to sandbox
        return { ok: true };
      },
    }),
  },
});
```

Then add UI in `MessagePrimitive.Parts components.tools.write_file` for a non-fallback render.

## 16. Test compile flow without a real sandbox

Stub `useCompiler` to return `wasmHex: "00".repeat(100)` after a 500 ms timeout:

```ts
// hooks/useCompiler.ts (test/dev variant)
export function useCompiler() {
  const [status, setStatus] = useState<CompilerStatus>("IDLE");
  const [wasmHex, setWasmHex] = useState<string | null>(null);

  return {
    status, wasmHex, logs: [],
    compile: (files) => {
      setStatus("COMPILING");
      setTimeout(() => { setWasmHex("00".repeat(100)); setStatus("SUCCESS"); }, 500);
    },
    reset: () => { setStatus("IDLE"); setWasmHex(null); },
    clearLogs: () => {},
  };
}
```

## 17. Add an env var to the sandbox spawn

`stellarIDE.sandbox.spawn(envVars)` accepts a `Record<string, string>`. From `EnvConfigModal`:

```ts
const env = {
  STELLAR_NETWORK: "testnet",
  WALLET_PUBKEY:   walletAddress,
  ...customVars,
};
await stellarIDE.sandbox.spawn(env);
```

Real impl forwards env to the container at startup.
