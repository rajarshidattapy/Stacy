# 05 — Monaco Editor Integration (Deep Dive)

Monaco gives: tokenization, syntax highlighting, IntelliSense (TS/JS), find/replace, multi-cursor, minimap, themes via JSON, LSP-style diagnostics.

Wrapper: `@monaco-editor/react`. Mount lives in `components/ide/IdeWorkspace.tsx`.

---

## 1. Mount JSX (`IdeWorkspace.tsx:941-974`)

```tsx
<Editor
  height="100%"
  defaultLanguage={getLanguage(workspace.activeFile)}
  key={editorSessionKey}
  path={workspace.activeFile}
  value={activeContent}
  theme={editorTheme}
  onMount={handleEditorMount}
  onChange={(val) =>
    dispatch({
      type: "UPDATE_FILE",
      payload: { path: workspace.activeFile, content: val, source: "editor" },
    })
  }
  options={{
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
  }}
/>
```

Prop semantics:

- `key={editorSessionKey}` — bumped on `LOAD_PROJECT` (`projectSessionKey`); forces full Monaco remount, dropping previous models.
- `path={activeFile}` — Monaco creates one model per unique URI. Switching `path` swaps the underlying model, preserving its undo stack. This is why "open old tab → undo works".
- `value={activeContent}` — controlled mode. `activeContent` falls back to `"// Loading from project…"` when the file's content hasn't been fetched yet (`IdeWorkspace.tsx:516-524`).
- `defaultLanguage` only used on first mount per `path` — subsequent `path` changes don't change language. Monaco infers from `path` extension after that via the language registry.
- `theme` — name registered via `monacoApi.editor.defineTheme(name, data)` before `setTheme(name)` would also work, both flows live in `applyEditorTheme`.

## 2. `getLanguage(path)` (`IdeWorkspace.tsx:107-127`)

```ts
const map: Record<string, string> = {
  rs:   "rust",
  ts:   "typescript",
  tsx:  "typescript",
  js:   "javascript",
  jsx:  "javascript",
  css:  "css",
  scss: "scss",
  json: "json",
  md:   "markdown",
  toml: "toml",
  yaml: "yaml",
  yml:  "yaml",
  html: "html",
  sh:   "shell",
};
return map[ext] ?? "plaintext";
```

`tsx`/`jsx` → `typescript`/`javascript` (NOT `tsx`/`jsx`) because Monaco's TS language service handles JSX via the `jsx: ReactJSX` compiler option set in `handleEditorMount`.

## 3. `handleEditorMount(editor, monaco)` walk (`IdeWorkspace.tsx:357-494`)

Step by step:

### 3.1 Refs
```ts
editorRef.current = editor;
monacoRef.current = monaco;
```

### 3.2 Theme apply (async)
```ts
void applyEditorTheme(editorTheme, monaco);
```

### 3.3 Cmd/Ctrl+F → built-in find
```ts
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
  void editor.getAction("actions.find")?.run();
});
```
This is necessary because Monaco's default keybinding matrix may be disabled depending on host. Force-binding ensures find always works.

### 3.4 TS/JS compiler options
```ts
const compilerOptions = {
  jsx:                  monaco.languages.typescript.JsxEmit.ReactJSX,
  target:               monaco.languages.typescript.ScriptTarget.Latest,
  allowJs:              true,
  checkJs:              false,
  allowNonTsExtensions: true,
  moduleResolution:     monaco.languages.typescript.ModuleResolutionKind.NodeJs,
};
monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
monaco.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions);
```

| Option              | Why                                                                                              |
|---------------------|--------------------------------------------------------------------------------------------------|
| `jsx: ReactJSX`     | New JSX transform — `import {jsx} from 'react/jsx-runtime'`. No need to import React for JSX.    |
| `target: Latest`    | Allow modern features in IntelliSense.                                                            |
| `allowJs: true`     | `.js` files participate in TS analysis.                                                           |
| `checkJs: false`    | Don't surface ts errors in `.js` files (would noise).                                             |
| `allowNonTsExtensions` | Allow virtual files with non-`.ts` extensions to be treated as TS modules.                    |
| `moduleResolution: NodeJs` | Node-style module lookup (works with package.json relative imports).                       |

### 3.5 JSX runtime ambient lib

```ts
const jsxRuntimeLib = `
  declare module "react/jsx-runtime" {
    export function jsx(type: any, props: any, key?: any): any;
    export function jsxs(type: any, props: any, key?: any): any;
    export function Fragment(props: { children?: any }): any;
  }
`;

const existingLibs = monaco.languages.typescript.typescriptDefaults.getExtraLibs();
if (!existingLibs || !existingLibs["react/jsx-runtime.d.ts"]) {
  const disposable = monaco.languages.typescript.typescriptDefaults.addExtraLib(jsxRuntimeLib, "react/jsx-runtime.d.ts");
  monaco.languages.typescript.javascriptDefaults.addExtraLib(jsxRuntimeLib, "react/jsx-runtime.d.ts");
  if (!monacoRef.current._jsxRuntimeDisposable) {
    monacoRef.current._jsxRuntimeDisposable = disposable;
  }
}
```

Without this, `.tsx` files report `Cannot find module 'react/jsx-runtime'`. Guard prevents duplicate registration during HMR (would otherwise throw or accumulate).

### 3.6 Selection listener — full body

```ts
editor.onDidChangeCursorSelection((e) => {
  const sel = editor.getSelection();
  if (!sel || sel.isEmpty()) {
    setSelection((prev) => ({ ...prev, isVisible: false }));
    return;
  }

  const model = editor.getModel();
  if (!model) {
    setSelection((prev) => ({ ...prev, isVisible: false }));
    return;
  }

  let startLine = sel.startLineNumber;
  let endLine   = sel.endLineNumber;
  let expandedStartColumn = sel.startColumn;
  let expandedEndColumn   = sel.endColumn;

  if (startLine === endLine) {
    const lineContent = model.getLineContent(startLine);
    const lineLength  = lineContent.length;
    if (sel.startColumn !== 1 || sel.endColumn !== lineLength + 1) {
      expandedStartColumn = 1;
      expandedEndColumn   = lineLength + 1;
    }
  } else {
    const firstLineLength = model.getLineContent(startLine).length;
    const lastLineLength  = model.getLineContent(endLine).length;
    if (sel.startColumn !== 1) expandedStartColumn = 1;
    if (sel.endColumn !== lastLineLength + 1) expandedEndColumn = lastLineLength + 1;
  }

  const Range = monaco.Range;
  const expandedSel = new Range(startLine, expandedStartColumn, endLine, expandedEndColumn);
  const selectedText = model.getValueInRange(expandedSel) || "";
  if (selectedText.trim().length < 3) {
    setSelection((prev) => ({ ...prev, isVisible: false }));
    return;
  }

  const endPos = expandedSel.getEndPosition();
  const coords = editor.getScrolledVisiblePosition(endPos);
  const editorDom = editor.getDomNode();

  if (coords && editorDom) {
    const rect = editorDom.getBoundingClientRect();
    setSelection({
      isVisible: true,
      position: { x: rect.left + coords.left, y: rect.top + coords.top + 24 },
      text: selectedText,
      startLine: startLine,
      endLine: endLine,
    });
  }
});
```

Behavior:
- **Whole-line expansion**: AI prompts get cleaner context if multiline selections cover full lines.
- **3-char floor**: drops accidental clicks / single-char selects.
- **Coords**: `getScrolledVisiblePosition` returns viewport-relative pixels; add `editorDom.getBoundingClientRect()` to get page coords; `+ 24` offsets popup below the line.

`<CodeSelectionPopup>` reads `selection` and renders Explain/Fix/Debug/Optimize buttons.

## 4. Themes — full pipeline

### 4.1 Storage helpers (`lib/monacoTheme.ts`)

```ts
export type MonacoThemeName = string & {};   // string-literal union in real file
export const DEFAULT_MONACO_THEME = "v0-dark";
export const MONACO_THEME_CHANGE_EVENT = "stacy:monaco-theme-change";

const STORAGE_KEY = "stacy.monaco-theme";

export function getStoredMonacoTheme(): MonacoThemeName { ... reads localStorage ... }
export function setStoredMonacoTheme(name: MonacoThemeName) { ... writes localStorage ... }
export function isMonacoThemeName(name: unknown): name is MonacoThemeName { ... validates ... }

export async function loadMonacoThemeData(name: MonacoThemeName): Promise<MonacoThemeData> {
  const res = await fetch(`/api/extensions/monaco-theme?name=${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(...);
  return res.json();
}
```

### 4.2 Apply (`IdeWorkspace.tsx:307-332`)

```ts
const applyEditorTheme = useCallback(async (themeName, monacoInstance?) => {
  const monacoApi = monacoInstance || monacoRef.current;
  if (!monacoApi) return;

  if (themeName === "v0-dark") {
    monacoApi.editor.defineTheme("v0-dark", {
      base: "vs-dark", inherit: true, rules: [],
      colors: {
        "editor.background":             "#09090b",
        "editor.lineHighlightBackground":"#18181b",
        "editorLineNumber.foreground":   "#52525b",
        "editor.selectionBackground":    "#3b0764",
      },
    });
  } else {
    const themeData = await loadMonacoThemeData(themeName);
    monacoApi.editor.defineTheme(themeName, themeData);
  }
  monacoApi.editor.setTheme(themeName);
}, []);
```

`base: "vs-dark"` inherits the dark token rules; `inherit: true` lets unspecified tokens use the base. `colors` override workbench palette. Add custom token highlights via `rules: [{ token: "keyword", foreground: "ff6e6e", fontStyle: "bold" }]`.

### 4.3 Mount/unmount listener (`IdeWorkspace.tsx:339-355`)

```ts
useEffect(() => {
  const handleThemeChange = (event: Event) => {
    const detail = (event as CustomEvent).detail?.theme;
    if (detail && isMonacoThemeName(detail)) setEditorTheme(detail);
    else                                      setEditorTheme(getStoredMonacoTheme());
  };
  window.addEventListener(MONACO_THEME_CHANGE_EVENT, handleThemeChange);
  return () => window.removeEventListener(MONACO_THEME_CHANGE_EVENT, handleThemeChange);
}, []);
```

`ExtensionsPanel`'s "Set Color Theme" dispatches:
```ts
setStoredMonacoTheme(name);
window.dispatchEvent(new CustomEvent(MONACO_THEME_CHANGE_EVENT, { detail: { theme: name } }));
```

### 4.4 Theme JSON shape (`lib/monacoThemes/<name>.json`)

```ts
{
  base: "vs" | "vs-dark" | "hc-black",
  inherit: boolean,
  rules: [{ token: string, foreground?: string, background?: string, fontStyle?: string }],
  colors: { [key: string]: string }      // keys per Monaco editor.* + workbench
}
```

`themelist.json` is `{ themeId: themeName }` mapping; `/api/extensions` reads it, generates SVG icons via `createMonacoThemeIcon(name, theme)`.

## 5. Find/replace

- In-file: Monaco's built-in find widget (Cmd/Ctrl+F).
- Cross-file: custom `SearchPanel` (see [07-search-panel.md](./07-search-panel.md)).

`options.find`:
- `addExtraSpaceOnTop: false` — don't pad the widget with extra margin.
- `autoFindInSelection: "never"` — don't auto-scope find to the current selection.
- `seedSearchStringFromSelection: "always"` — pre-fill the find input with the current selection.

## 6. State sync model

```
                ┌─────────────────────────┐
                │   workspaceReducer       │ ← TRUTH
                │   fileContents[path]     │
                └──┬──────────────────┬───┘
                   │ value prop        │ UPDATE_FILE
                   ▼                   │
                ┌─────────────────────────┐
                │   <Editor> (Monaco)     │ ← VIEW
                └─────────────────────────┘
```

Two flows:

1. **Editor → State** (`onChange`): always dispatches `UPDATE_FILE` with `source: "editor"`.
2. **State → Editor**: React re-renders; the wrapper diffs `value` and updates the model. **For closed files**, no model exists → `forceSetModelContent(path, content)` is the bypass.

`syncMonacoToWorkspace(source = "system")` is the explicit flush direction (Editor → State), called:
- 100 ms after `activeFile` changes (captures unsaved typing before tab swap).
- Before `handleCompile` (so the compiler sees fresh content).
- Before `handleSyncToSandbox` (so sandbox receives fresh content).

Guards:
- Refuse if `editorRef.current` or `workspace.activeFile` missing.
- Refuse if model disposed (`model.isDisposed()`).
- Refuse if Monaco is empty but workspace had content (unmount race protection).
- Skip if content already matches (no-op).

## 7. `forceSetModelContent` URI-fuzz match

```ts
const model = monacoRef.current.editor.getModels().find((m) => {
  const uriStr = m.uri.toString();
  return uriStr.endsWith(path) || uriStr.includes(path);
});
if (model && !model.isDisposed()) model.setValue(content);
```

`@monaco-editor/react` mints URIs like `inmemory://model/1` or `file:///<path>` depending on options. Fuzzy match (`endsWith` or `includes`) covers all observed shapes. Verify via `console.log(monacoRef.current.editor.getModels().map(m => m.uri.toString()))` if matches fail.

## 8. Performance knobs

- `minimap.autohide: "scroll"` — minimap visible only during scroll. Less visual chrome.
- `scrollBeyondLastLine: false` — no empty page after EOF (UX preference).
- `lineNumbersMinChars: 4` — pre-allocate gutter to 4 digits; avoids jitter when crossing 9 → 10 lines.
- `cursorBlinking: "smooth"` — pulsing cursor (vs blink/solid).
- `smoothScrolling: true` — animated scroll via mouse wheel.
- `padding: { top: 16 }` — gives 16px breathing room at top of editor.

## 9. Common pitfalls

| Issue                                            | Fix                                                                                |
|--------------------------------------------------|------------------------------------------------------------------------------------|
| Manual `model.dispose()` calls break `<Editor>`. | Don't. Wrapper manages model lifecycle via `path` prop.                            |
| HMR double-registers JSX runtime lib.            | Guarded by `getExtraLibs()["react/jsx-runtime.d.ts"]` lookup.                       |
| Theme not applying after switch.                 | Confirm `MONACO_THEME_CHANGE_EVENT` dispatched with `{ detail: { theme: name } }`. |
| New language doesn't tokenize.                   | Add to `getLanguage` map; Monaco auto-loads basic tokenizer for built-in languages. |
| Cmd+F intercepted by browser.                    | `editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyF, run-find)` overrides.            |
| Selection popup never shows for `Cmd+A`.         | `selectedText.trim().length < 3` filter; usually whole-file selection passes.       |
| Selection popup at wrong x/y.                    | `editor.getScrolledVisiblePosition` is viewport-relative. Always add `editorDom.getBoundingClientRect()`. |

## 10. Future extensions

- Wire `LanguageFeatureRegistry` (extension system) → Monaco completion/hover/definition providers.
- Add per-file dirty markers (compare `fileContents[path]` to last-saved snapshot, paint a dot in `EditorTabs`).
- Bridge agent diffs → diff editor (`monaco.editor.createDiffEditor`) for review-before-apply UX.
