# 04 — `IdeWorkspace.tsx` Walkthrough (Deep Dive)

File: `components/ide/IdeWorkspace.tsx` — ~1037 lines. The IDE shell. Owns no domain truth; wires Monaco + sidebars + log dock + right panel together.

---

## 1. Imports map (top of file)

```
WorkspaceState, DeployedContract, IdeMode      from @/types/ide
cn                                              from @/lib/utils
IdeHeader, OPEN_FILE_SEARCH_EVENT               from ./IdeHeader
FileExplorer                                    from ./FileExplorer
ActionPanel                                     from ./ActionPanel
AgentActionPanel                                from ./AgentActionPanel
ActivityBar, SidebarPanel                       from ./ActivityBar
SearchPanel                                     from ./SearchPanel
ExtensionsPanel, IDEExtension                   from ./ExtensionsPanel
ExtensionDetailView                             from ./ExtensionDetailView
EmptyEditorView                                 from ./EmptyEditorView
EditorTabs                                      from ./EditorTabs
LogDock                                         from ./LogsDock
PhaseGroup, StepEntry                           from @/hooks/useAgentState
CodeSelectionPopup, AIAction                    from @/components/ui/CodeSelectionPopup
DEFAULT_MONACO_THEME, MONACO_THEME_CHANGE_EVENT,
MonacoThemeName, getStoredMonacoTheme,
isMonacoThemeName, loadMonacoThemeData          from @/lib/monacoTheme
Editor, OnMount                                 from @monaco-editor/react
```

## 2. Props (`IdeWorkspaceProps`, lines 31-97)

Categorized:

### Core
- `mode: IdeMode` — `"contract" | "frontend"`. Drives FileExplorer refresh button visibility; selects right panel content for `EmptyEditorView` etc.
- `interactionMode?: "agentic" | "manual"` — picks `ActionPanel` vs `AgentActionPanel`.
- `workspace: WorkspaceState` — current mode's reducer state.
- `dispatch` — current mode's reducer `dispatch`.

### Compile / deploy
- `deployedContracts`, `compilerStatus`, `deployerStatus`, `wasmHex`, `latestContractId`, `isWalletConnected`.
- Network: `network`, `onNetworkChange`, `explorerUrl`.
- Bindings: `onGenerateBindings(id)`, `bindingsStatus`.

### Sandbox
- `sandboxPreviewUrl`, `isSandboxRunning`, `isSandboxConnected`, `sandboxStatus`.
- `onSpawnSandbox`, `onStopSandbox`.
- `onRefreshFileTree`.

### Preview
- `onTogglePreview`, `hasPendingChanges`.

### Monaco bridge (upward ref injection)
- `onMonacoSyncReady?: (syncFn: () => void) => void` — `IdeWorkspace` registers a sync callback the parent can fire before compile/sync.
- `onForceModelContentReady?: (fn: (path, content) => void) => void` — for AI updates to closed files.
- `editorSessionKey?: number` — bumped on project load → forces full Monaco remount.

### Code action bridge
- `onCodeAction?: (action: AIAction, selection: { file, startLine, endLine, text }) => void`

### Toggles
- `onToggleFileExplorer`, `onToggleActionPanel`, `onToggleTerminal`, `onToggleChat`.
- `isChatCollapsed`.

### Agent panel
- `agentPhaseGroups`, `agentLastAction`, `onClearAgentSession`.

### Other
- `onOpenEnvConfig`, `onExecuteCommand(cmd)`, `onSyncToSandbox`.

## 3. Component-local state (lines 172-181)

```ts
editorRef       useRef<any>                   // monaco IStandaloneCodeEditor
monacoRef       useRef<any>                   // monaco namespace
iframeRef       useRef<HTMLIFrameElement>
editorTheme     MonacoThemeName               // mirrors localStorage; default "v0-dark"
workspaceRef    useRef<HTMLDivElement>        // measures container for resize
activeSidebarPanel SidebarPanel               // "explorer" | "search" | "extensions" | null
sidebarWidth    number                        // px, clamped [160, 600], default 260
isResizing      boolean
selectedExtension IDEExtension | null
selection       SelectionState                // {isVisible, position, text, startLine, endLine}
previewKey      number                        // forces iframe remount
```

```ts
type SelectionState = {
  isVisible: boolean;
  position: { x: number; y: number };
  text: string;
  startLine: number;
  endLine: number;
};
```

## 4. `getLanguage(path)` (lines 107-127)

Filename → Monaco language id:

```
rs→rust, ts/tsx→typescript, js/jsx→javascript,
css→css, scss→scss, json→json, md→markdown,
toml→toml, yaml/yml→yaml, html→html, sh→shell
default→plaintext
```

## 5. Sidebar resizer (lines 191-230)

```ts
handleMouseDown → setIsResizing(true), e.preventDefault()

useEffect on isResizing:
  mousemove:
    width = e.clientX - workspaceRef.left
    if width < 50: setSidebarWidth(260); setIsResizing(false); onToggleFileExplorer()
    else: setSidebarWidth(clamp(width, 160, 600))
  mouseup → setIsResizing(false)
  body cursor toggled "col-resize"/"default"
```

Doubleclick on the resizer → `setSidebarWidth(260)` (line 910).

## 6. Global keyboard shortcuts (lines 251-268)

```
Cmd/Ctrl+Shift+F → openFindInFiles()
                     opens explorer if closed, then setActiveSidebarPanel("search")
Cmd/Ctrl+Shift+P → openCommandPalette() = openFileSearch()
                     dispatches CustomEvent OPEN_FILE_SEARCH_EVENT on window
                     IdeHeader listens, focuses its search input
```

NOTE: `IdeHeader.tsx:170-174` *also* binds `Cmd/Ctrl+P` (no Shift) to focus the search. So both `Cmd+P` and `Cmd+Shift+P` open file search. `Cmd+\`` toggles the terminal (`IdeHeader.tsx:176-179`).

## 7. Preview reload logic (lines 269-293)

Tracks via refs:
```ts
prevHasPendingChanges = useRef(hasPendingChanges)
prevIsPreviewMode     = useRef(workspace.ui.isPreviewMode)
```

Effect:
```ts
justEnteredPreview = !prev.isPreviewMode && current.isPreviewMode
syncCompleted      = current.isPreviewMode && prev.hasPendingChanges === true && !current.hasPendingChanges
if (justEnteredPreview || syncCompleted) setPreviewKey(k => k + 1)
prev.isPreviewMode = current.isPreviewMode
prev.hasPendingChanges = current.hasPendingChanges
```

`previewKey` is the `key` prop of the iframe — bumping forces React to unmount and remount with a fresh document.

`handleRefreshPreview` (line 291) is the manual refresh button in the iframe chrome.

## 8. Theme handling (lines 303-355)

```ts
useEffect(() => setEditorTheme(getStoredMonacoTheme()), [])
```

`applyEditorTheme(name, monacoApi?)`:
```ts
if (name === "v0-dark") {
  monacoApi.editor.defineTheme("v0-dark", {
    base: "vs-dark", inherit: true, rules: [],
    colors: {
      "editor.background":           "#09090b",
      "editor.lineHighlightBackground":"#18181b",
      "editorLineNumber.foreground": "#52525b",
      "editor.selectionBackground":  "#3b0764",
    },
  });
} else {
  const themeData = await loadMonacoThemeData(name);  // fetches /api/extensions/monaco-theme
  monacoApi.editor.defineTheme(name, themeData);
}
monacoApi.editor.setTheme(name);
```

Effect listens for `MONACO_THEME_CHANGE_EVENT` (line 339-355):
```ts
const handleThemeChange = (event: Event) => {
  const detail = (event as CustomEvent).detail?.theme;
  if (detail && isMonacoThemeName(detail)) setEditorTheme(detail);
  else setEditorTheme(getStoredMonacoTheme());
};
window.addEventListener(MONACO_THEME_CHANGE_EVENT, handleThemeChange);
```

`ExtensionsPanel`'s "Set Color Theme" button is the dispatcher (`setStoredMonacoTheme(name); window.dispatchEvent(new CustomEvent(MONACO_THEME_CHANGE_EVENT, { detail: { theme: name } }))`).

## 9. `handleEditorMount(editor, monaco)` (lines 357-494)

The big mount handler. Sequence:

1. `editorRef.current = editor; monacoRef.current = monaco`.
2. `applyEditorTheme(editorTheme, monaco)` — synchronously start theme load.
3. Override Cmd/Ctrl+F to run Monaco's built-in `actions.find`:
   ```ts
   editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
     void editor.getAction("actions.find")?.run();
   });
   ```
4. **TypeScript/JavaScript defaults** — for `.ts`, `.tsx`, `.js`, `.jsx`:
   ```ts
   const compilerOptions = {
     jsx:                 monaco.languages.typescript.JsxEmit.ReactJSX,
     target:              monaco.languages.typescript.ScriptTarget.Latest,
     allowJs:             true,
     checkJs:             false,
     allowNonTsExtensions:true,
     moduleResolution:    monaco.languages.typescript.ModuleResolutionKind.NodeJs,
   };
   monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
   monaco.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions);
   ```
5. **JSX runtime ambient declaration** — guarded against duplicate registration:
   ```ts
   const jsxRuntimeLib = `
     declare module "react/jsx-runtime" {
       export function jsx(type: any, props: any, key?: any): any;
       export function jsxs(type: any, props: any, key?: any): any;
       export function Fragment(props: { children?: any }): any;
     }`;
   const existingLibs = typescriptDefaults.getExtraLibs();
   if (!existingLibs?.["react/jsx-runtime.d.ts"]) {
     const disposable = typescriptDefaults.addExtraLib(jsxRuntimeLib, "react/jsx-runtime.d.ts");
     javascriptDefaults.addExtraLib(jsxRuntimeLib, "react/jsx-runtime.d.ts");
     monacoRef.current._jsxRuntimeDisposable = disposable;  // for HMR/cleanup
   }
   ```
6. **Selection listener** (lines 413-493):
   ```ts
   editor.onDidChangeCursorSelection((e) => {
     const sel = editor.getSelection();
     if (!sel || sel.isEmpty()) { setSelection(s => ({...s, isVisible: false})); return; }
     const model = editor.getModel();
     if (!model) return;

     // Expand to whole lines if user only highlighted partial:
     let startLine = sel.startLineNumber, endLine = sel.endLineNumber;
     let expandedStartColumn = sel.startColumn, expandedEndColumn = sel.endColumn;

     if (startLine === endLine) {
       const lineLen = model.getLineContent(startLine).length;
       if (sel.startColumn !== 1 || sel.endColumn !== lineLen + 1) {
         expandedStartColumn = 1; expandedEndColumn = lineLen + 1;
       }
     } else {
       if (sel.startColumn !== 1) expandedStartColumn = 1;
       const lastLineLen = model.getLineContent(endLine).length;
       if (sel.endColumn !== lastLineLen + 1) expandedEndColumn = lastLineLen + 1;
     }

     const Range = monaco.Range;
     const expanded = new Range(startLine, expandedStartColumn, endLine, expandedEndColumn);
     const selectedText = model.getValueInRange(expanded) || "";
     if (selectedText.trim().length < 3) { setSelection(s => ({...s, isVisible:false})); return; }

     const endPos = expanded.getEndPosition();
     const coords = editor.getScrolledVisiblePosition(endPos);
     const editorDom = editor.getDomNode();
     if (coords && editorDom) {
       const rect = editorDom.getBoundingClientRect();
       setSelection({
         isVisible: true,
         position: { x: rect.left + coords.left, y: rect.top + coords.top + 24 },
         text: selectedText, startLine, endLine,
       });
     }
   });
   ```

   Key behavior: **partial line selections always expand to whole lines** — keeps AI prompt context syntactically clean. `< 3 chars` threshold avoids popping for accidental clicks.

## 10. `handleAIAction(action)` (lines 496-514)

```ts
if (!workspace.activeFile) return;
setSelection(s => ({...s, isVisible: false}));
onCodeAction?.(action, {
  file: workspace.activeFile,
  startLine: selection.startLine,
  endLine:   selection.endLine,
  text:      selection.text,
});
```

The popup component (`components/ui/CodeSelectionPopup.tsx`) defines `AIAction` and renders the action buttons.

## 11. `activeContent` IIFE (lines 516-524)

```ts
const activeContent = (() => {
  if (!workspace.activeFile) return "";
  const content = workspace.fileContents[workspace.activeFile];
  if (content === undefined) {
    console.warn("[Monaco] Missing content for", workspace.activeFile);
    return "// Loading from project…";
  }
  return content;
})();
```

Defends against open tabs whose content hasn't been fetched yet (lazy load via sandbox). Placeholder string is human-friendly; the real content arrives via `SYNC_FILE_CONTENT`.

## 12. `syncMonacoToWorkspace(source = "system")` (lines 528-580)

Defensive sync from Monaco view → reducer state:

```ts
if (!editorRef.current || !workspace.activeFile) return;
const model = editorRef.current.getModel();
if (!model || model.isDisposed()) {
  console.warn("[Monaco] Model is disposed or missing, skipping sync");
  return;
}
try {
  const monacoContent = editorRef.current.getValue();
  const workspaceContent = workspace.fileContents[workspace.activeFile] || "";

  // GUARD: never overwrite real content with empty (unmount race)
  if (monacoContent.trim().length === 0 && workspaceContent.trim().length > 0) {
    console.warn("[Monaco] Refusing to sync empty content over existing content");
    return;
  }

  if (monacoContent !== workspaceContent) {
    dispatch({
      type: "UPDATE_FILE",
      payload: { path: workspace.activeFile, content: monacoContent, source },
    });
  }
} catch (e) { console.error("[Monaco] Error syncing Monaco to workspace:", e); }
```

Exposed upward via:

```ts
useEffect(() => onMonacoSyncReady?.(syncMonacoToWorkspace), [onMonacoSyncReady, syncMonacoToWorkspace]);
```

Parent (`Generate.tsx:802-805`) stores it in `monacoSyncRef.current` and calls before compile/sync.

Also fired on `activeFile` change (lines 609-621), 100 ms debounced — captures unsaved typing as user switches tabs:

```ts
useEffect(() => {
  if (workspace.activeFile && editorRef.current && !workspace.ui.isPreviewMode) {
    const timer = setTimeout(() => syncMonacoToWorkspace(), 100);
    return () => clearTimeout(timer);
  }
}, [workspace.activeFile, syncMonacoToWorkspace, workspace.ui.isPreviewMode]);
```

The preview-mode guard avoids stomping reducer state with stale Monaco content while the editor is hidden.

## 13. `forceSetModelContent(path, content)` (lines 590-599)

For AI updates to NON-active files:

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

`uri.toString()` matching is fuzzy by design — Monaco often prefixes URIs with `file:///` or `inmemory://`, so `endsWith` / `includes` covers all cases.

Exposed via `onForceModelContentReady` ref injection (lines 601-605).

## 14. JSX render structure (lines 623-1037)

```
<div bg-[#050505] p-2.5 flex>
  <div bg-[#09090b] rounded-2xl border>
    <CodeSelectionPopup .../>                        ← floating overlay over editor
    <IdeHeader .../>                                  ← always visible (50px)

    {workspace.ui.isPreviewMode ? (
      <PreviewView/>                                  ← contract info card OR iframe
    ) : (
      <main flex>
        <aside style={{width: sidebarWidth}}>         ← only if isFileExplorerOpen
          <ActivityBar activePanel onPanelSelect/>
          {explorer/search/extensions panel}
          <ResizerHandle/>
        </aside>

        <section editor>
          {!extension && activeFile && <EditorTabs/>}
          {extension       ? <ExtensionDetailView/> :
           activeFile     ? <Editor.../>            :
                            <EmptyEditorView/>}
        </section>

        <LogDock/>                                    ← sits inside the center column
      </main>

      {interactionMode === "agentic" ? <AgentActionPanel/> : <ActionPanel/>}
    )}
  </div>
</div>
```

## 15. Preview mode internals (lines 656-840)

When `workspace.ui.isPreviewMode`:

### Contract mode (line 658):
Renders an info card explaining contracts auto-compile/deploy in background; Click "Code" to return.

### Frontend mode with running sandbox (line 668):
```
Browser-style address bar (10px tall):
  ● status dot (animated green pulse)
  ↻ refresh button → handleRefreshPreview (previewKey++)
  url bar (truncated <span>) showing sandboxPreviewUrl
  ↗ open in new tab button (window.open)

<iframe
  key={previewKey}                    ← forces remount on reload
  src={sandboxPreviewUrl}
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
/>
```

### Frontend mode without running sandbox (line 740):
- `spawning` / `preview_starting` → spinner with status text.
- Otherwise → "Live Preview" placeholder with `Start Sandbox` button (calls `onSpawnSandbox`).

## 16. Center editor area (lines 924-985)

Decision tree:

```
selectedExtension !== null   → <ExtensionDetailView extension={selectedExtension} onClose={() => setSelectedExtension(null)}/>
workspace.activeFile         → <Editor key={editorSessionKey} path={activeFile} value={activeContent} ... />
otherwise                    → <EmptyEditorView .../>
```

`<Editor>` options (line 959-973):

```ts
{
  minimap: { autohide: "scroll" },
  fontSize: 13,
  fontFamily: "JetBrains Mono, monospace",
  padding: { top: 16 },
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  cursorBlinking: "smooth",
  lineNumbersMinChars: 4,
  find: {
    addExtraSpaceOnTop: false,
    autoFindInSelection: "never",
    seedSearchStringFromSelection: "always",
  },
}
```

`onChange={(val) => dispatch({ type: "UPDATE_FILE", payload: { path: workspace.activeFile, content: val, source: "editor" } })}`. The `source: "editor"` annotation lets the parent's effect skip dispatching back to the sandbox if origin was already from the user.

## 17. Sidebar selection wiring (lines 847-922)

Inside the resizable aside:

```
<ActivityBar activePanel onPanelSelect={(panel) => {
  if (panel) setActiveSidebarPanel(panel);
  else       onToggleFileExplorer();        // null = collapse sidebar
}} />
```

Then exactly one of:

| `activeSidebarPanel`  | Component                                         | Props                                             |
|-----------------------|---------------------------------------------------|---------------------------------------------------|
| `"explorer"`          | `<FileExplorer files={fileTree} activeFile onSelectFile={handleOpenFile} onAddFile/onAddFolder/onRename/onDelete dispatch onRefresh={onRefreshFileTree} showRefresh={mode === "frontend" && isSandboxConnected}/>` | dispatch wrapped helpers |
| `"search"`            | `<SearchPanel files fileContents onSelectFile={handleOpenFile} dispatch/>`                                                                                                                                          |                                                   |
| `"extensions"`        | `<ExtensionsPanel activeExtensionId={selectedExtension?.id} onSelectExtension={setSelectedExtension}/>`                                                                                                              |                                                   |

`handleOpenFile(file)` (lines 183-189):
```ts
setSelectedExtension(null);                    // exit extension detail when opening a file
dispatch({ type: "OPEN_FILE", payload: file });
```

## 18. Right panel (lines 999-1031)

```ts
{interactionMode === "agentic"
  ? <AgentActionPanel
      isOpen={workspace.ui.isActionPanelOpen}
      phaseGroups={agentPhaseGroups}
      lastAction={agentLastAction}
      onClearSession={onClearAgentSession ?? (() => {})}
    />
  : <ActionPanel
      mode, isOpen, terminalStatus, deployedContracts,
      onCompile, onDeploy, onGenerateBindings,
      compilerStatus, deployerStatus, wasmHex, latestContractId, isWalletConnected,
      network, onNetworkChange, explorerUrl,
      sandboxStatus, isSandboxConnected={isSandboxRunning}, onSpawnSandbox, onStopSandbox,
      bindingsStatus, onSyncToSandbox
    />}
```

Note: `ActionPanel` receives `isSandboxConnected={isSandboxRunning}` — somewhat misnamed; "running" means status `"running"` or `"preview_starting"` (from `useStellarIDE`). For deeper liveness you'd use the actual `isSandboxConnected` (`agentStatus === "connected"`).

## 19. Bug-trace cheatsheet

| Symptom                                            | First place to look                                                  |
|----------------------------------------------------|----------------------------------------------------------------------|
| Tab switch loses unsaved Monaco edits              | `useEffect` line 609-621 — was the file in preview mode? guard skips sync. |
| AI write didn't update Monaco for closed file      | `forceSetModelContent` URI matcher (`endsWith` / `includes`).         |
| Theme didn't apply after install                   | `MONACO_THEME_CHANGE_EVENT` listener; `loadMonacoThemeData` fetch.    |
| Cmd+Shift+P silently does nothing                  | `OPEN_FILE_SEARCH_EVENT` listener in `IdeHeader.tsx:186-194`.          |
| Sidebar can't be dragged                           | `handleMouseDown` + isResizing effect.                                |
| Iframe stuck stale after sync                      | `previewKey` effect (lines 275-289). Verify `hasPendingChanges` toggled false. |
| Selection popup never opens                        | `editor.onDidChangeCursorSelection` — confirm `< 3` filter not biting.|
