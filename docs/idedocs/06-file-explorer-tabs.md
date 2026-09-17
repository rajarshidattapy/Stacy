# 06 — File Explorer, Editor Tabs, Activity Bar (Deep Dive)

## 1. ActivityBar (`components/ide/ActivityBar.tsx`, ~65 lines)

```ts
export type SidebarPanel = "explorer" | "search" | "extensions" | null;

interface ActivityBarProps {
  activePanel: SidebarPanel;
  onPanelSelect: (panel: SidebarPanel) => void;
}
```

Renders three buttons in a 44 px-tall bar (`h-11`), each with:

| Button     | Icon (lucide) | Panel id        |
|------------|---------------|-----------------|
| Explorer   | `Files`       | `"explorer"`    |
| Search     | `Search`      | `"search"`      |
| Extensions | `LayoutGrid`  | `"extensions"`  |

Active state: light text + `0.5 px` underline at the bottom (`absolute bottom-0 ... bg-zinc-200 rounded-t`).

`togglePanel(panel)`:
```ts
onPanelSelect(activePanel === panel ? null : panel);
```

`null` is the collapse signal — `IdeWorkspace` interprets it as "hide sidebar" (`onToggleFileExplorer()`).

## 2. FileExplorer (`components/ide/FileExplorer.tsx`, ~530 lines)

### 2.1 Props

```ts
interface FileExplorerProps {
  files: FileNode[];
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  isOpen: boolean;
  onAddFile?:   (parentPath: string, fileName: string) => void;
  onAddFolder?: (parentPath: string, folderName: string) => void;
  onRename?:    (oldPath: string, newName: string) => void;
  onDelete?:    (path: string) => void;
  onRefresh?:   () => void;
  showRefresh?: boolean;
}
```

`onRefresh` is called when refresh icon clicked. `showRefresh` is gated by `mode === "frontend" && isSandboxConnected` (passed from `IdeWorkspace.tsx:888`).

### 2.2 `getFileIcon(name, isExpanded?, isFolder?)`

```ts
if (isFolder) return isExpanded ? <FolderOpen text-zinc-400/> : <Folder text-zinc-400/>;

const ext = name.split(".").pop()?.toLowerCase();
switch (ext) {
  case "ts": case "tsx":  return <FileCode2 text-blue-400/80/>;
  case "js": case "jsx":  return <FileCode2 text-yellow-400/80/>;
  case "json":            return <FileJson  text-orange-400/80/>;
  case "rs":              return <FileCode2 text-orange-500/80/>;
  case "css":             return <Type      text-blue-300/80/>;
  default:                return <FileText  text-zinc-500/>;
}
```

Add a new ext: extend the switch.

### 2.3 `<ContextMenu>` (lines 77-133)

Right-click on row → opens fixed-positioned menu, position-clamped to viewport:

```ts
const menuWidth = 180;
const menuHeight = isFolder ? 140 : 92;
const clampedX = Math.min(x, window.innerWidth  - menuWidth  - 8);
const clampedY = Math.min(y, window.innerHeight - menuHeight - 8);
```

Menu items:
- For folders: `New File`, `New Folder`, divider, `Rename`, `Delete`.
- For files: `Rename`, `Delete`.

Closes on outside click or Escape.

### 2.4 `<InlineInput>` (lines 135-212)

For inline rename / new entry:

```ts
{ initialValue, onConfirm, onCancel, icon, validate? }

state: value, error
inputRef.focus().select() on mount
onChange → setValue + run validate(val) → setError
onKeyDown:
  Enter   → handleConfirm() (skip if error)
  Escape  → onCancel()
onBlur:
  if (!error) onConfirm(value)
  else        onCancel()
```

Renders error label below the input via `<motion.div>` (framer-motion `AnimatePresence`).

`validate` is wired to `lib/fileTreeUtils.isValidName` and `nameExistsInParent` checks on the consumer side.

### 2.5 `<FileItem>` (recursive renderer, lines 214+)

State per row:
```ts
isExpanded         (default true; folders only)
isRenaming
showAddInput       { type: "file" | "folder" } | null
addInputValue
contextMenu        { x, y } | null
```

Row layout:
```
[indent × level] [chevron if folder] [icon] [name | InlineInput]
```

Click handler:
- File row → `onSelectFile(filePath)`.
- Folder row → toggles `isExpanded`.

Right-click → `setContextMenu({ x: e.clientX, y: e.clientY })`, prevent default.

`handleRename()` calls `onRename(filePath, renameValue.trim())` only if non-empty AND changed.

`handleAddItem()` dispatches `onAddFile(filePath, name)` or `onAddFolder(filePath, name)` based on `showAddInput.type`.

Folder children rendered via `<AnimatePresence>` so add/remove animates.

### 2.6 Mutation wiring in `IdeWorkspace.tsx` (lines 869-887)

```tsx
<FileExplorer
  files={workspace.fileTree}
  activeFile={workspace.activeFile}
  onSelectFile={handleOpenFile}
  isOpen={true}
  onAddFile={(parentPath, fileName) =>
    dispatch({ type: "ADD_FILE", payload: { parentPath, fileName } })
  }
  onAddFolder={(parentPath, folderName) =>
    dispatch({ type: "ADD_FOLDER", payload: { parentPath, folderName } })
  }
  onRename={(oldPath, newName) =>
    dispatch({ type: "RENAME_FILE", payload: { oldPath, newName } })
  }
  onDelete={(path) =>
    dispatch({ type: "DELETE_FILE", payload: { path } })
  }
  onRefresh={onRefreshFileTree}
  showRefresh={mode === "frontend" && isSandboxConnected}
/>
```

Reducer cases consume these (see [03-state-and-reducer.md](./03-state-and-reducer.md)).

## 3. EditorTabs (`components/ide/EditorTabs.tsx`, ~118 lines)

### 3.1 Props

```ts
interface EditorTabsProps {
  openFiles: string[];
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  onCloseFile:  (path: string) => void;
}
```

### 3.2 Tab rendering

```tsx
{openFiles.map((path) => {
  const fileName = path.split("/").pop() || path;
  const isActive = activeFile === path;
  return (
    <div onClick={() => onSelectFile(path)} className={cn(
      "group relative flex h-full min-w-[140px] max-w-[200px] items-center gap-2.5 px-4 cursor-pointer transition-all",
      isActive
        ? "bg-[#0c0c0e] text-white"
        : "text-zinc-500 hover:bg-white/[0.02] hover:text-zinc-300"
    )}>
      <FileCode2 className={isActive ? "text-[#4ee06a]" : "text-zinc-500"}/>
      <span className="truncate text-[12px] font-medium flex-1">{fileName}</span>
      {isActive && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#4ee06a] shadow-[0_-1px_4px_rgba(78,224,106,0.2)]"/>}
      <button onClick={(e) => { e.stopPropagation(); onCloseFile(path); }} className={isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}>
        <X className="h-3 w-3"/>
      </button>
      {!isActive && <div className="absolute right-0 top-1/4 bottom-1/4 w-px bg-white/[0.05]"/>}
    </div>
  );
})}
```

- `min-w-[140px] max-w-[200px]` — tab width clamp; long names ellipsize.
- Close `X` button: `e.stopPropagation()` prevents the click from bubbling to the tab `onClick` (which would re-select).
- Vertical separator (`w-px bg-white/[0.05]`) between inactive tabs.

### 3.3 Breadcrumbs strip (lines 90-115)

```tsx
{activeFile && (
  <div className="flex h-8 items-center gap-1.5 px-4 bg-[#09090b] border-b">
    {activeFile.split("/").map((part, i, arr) => (
      <div key={i} className="flex items-center gap-1.5 shrink-0">
        {i > 0 && <span className="text-white text-[12px] font-bold mx-0.5 mt-0.5">›</span>}
        <div className="flex items-center gap-1.5">
          {i === arr.length - 1 && <FileCode2 className="h-3.5 w-3.5 text-white"/>}
          <span className="text-white text-[12px] font-medium tracking-wide">{part}</span>
        </div>
      </div>
    ))}
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-white text-[12px] font-bold mx-0.5 mt-0.5">›</span>
      <span className="text-white text-[12px] font-medium">...</span>
    </div>
  </div>
)}
```

Trailing `›...` is a placeholder for a future symbol picker (jump to function/class).

### 3.4 `getSymbolName(path)` (lines 19-27)

```ts
const fileName = path.split("/").pop() || "";
const nameWithoutExt = fileName.split(".")[0];
return nameWithoutExt.split(/[-_.]/)
  .map(w => w.charAt(0).toUpperCase() + w.slice(1))
  .join("");
```

Currently unused in render — kept for future symbol-picker / breadcrumb symbol display (`hello-world.ts` → `HelloWorld`).

## 4. EmptyEditorView (`components/ide/EmptyEditorView.tsx`)

Shown when `!workspace.activeFile && !selectedExtension`.

Quick action buttons:
- **Go to file** → `onGoToFile()` → focus `IdeHeader` search.
- **Find in files** → `onFindInFiles()` → switches sidebar to `"search"`.
- **Command palette** → `onCommandPalette()` → currently same as Go to file.
- **Toggle terminal** → `onToggleTerminal()`.

## 5. ExtensionDetailView (replaces editor when extension selected)

Mounted in the same slot as `<Editor>`:
```tsx
{selectedExtension ? <ExtensionDetailView extension={selectedExtension} onClose={() => setSelectedExtension(null)}/>
 : workspace.activeFile ? <Editor .../>
 : <EmptyEditorView .../>}
```

Sets `selectedExtension` from `ExtensionsPanel.onSelectExtension`. Closing it calls `setSelectedExtension(null)`, returning to whatever `activeFile` was last.

## 6. State flow — file open

```
User clicks file row in FileExplorer
  ▼
FileExplorer.<FileItem> onClick → onSelectFile(filePath)
  ▼
IdeWorkspace.handleOpenFile(file):
  setSelectedExtension(null)           // exit extension view if any
  dispatch({ type: "OPEN_FILE", payload: file })
  ▼
workspaceReducer:
  recentFiles = [file, ...recentFiles.filter(f => f !== file)].slice(0, 20)
  if (!openFiles.includes(file)) openFiles.push(file)
  activeFile = file
  ▼
React re-renders:
  EditorTabs highlights new tab
  <Editor path={file} value={fileContents[file]}/> swaps model
```

If the file's content isn't cached (`fileContents[file] === undefined`), `activeContent` returns `"// Loading from project…"`. Lazy fetch is triggered by an effect in `Generate.tsx:947-966` that calls `stellarIDE.sandbox.readFile(file)`.

## 7. State flow — close active tab

```
User clicks X on active tab
  ▼
EditorTabs.<button onClick> → onCloseFile(file)
  ▼
dispatch({ type: "CLOSE_FILE", payload: file })
  ▼
workspaceReducer:
  newOpen = openFiles.filter(f => f !== file)
  activeFile = (state.activeFile === file)
                 ? newOpen[newOpen.length - 1] || null
                 : state.activeFile
  ▼
If activeFile became null, EditorTabs returns null (line 29: `if (openFiles.length === 0) return null;`)
EmptyEditorView renders.
```

## 8. State flow — rename a file

```
Right-click row → ContextMenu → Rename
  ▼
<FileItem>.setIsRenaming(true)
  ▼
<InlineInput onConfirm={(newName) => onRename(filePath, newName)}>
  ▼
dispatch({ type: "RENAME_FILE", payload: { oldPath, newName } })
  ▼
workspaceReducer:
  newPath = pathParts (with last segment swapped)
  newTree = renameNodeInTree(...)
  fileContents[newPath] = fileContents[oldPath]; delete oldPath
  openFiles  = openFiles.map(f => f === oldPath ? newPath : f)
  recentFiles = recent.map(f => f === oldPath ? newPath : f)
  activeFile = activeFile === oldPath ? newPath : activeFile
```

Folder rename cascades all child IDs (`renameNodeInTree` traverses children and updates `node.id`).

## 9. State flow — delete a folder

```
Right-click folder → Delete
  ▼
dispatch({ type: "DELETE_FILE", payload: { path: folderPath } })
  ▼
workspaceReducer:
  newTree = deleteNodeFromTree(tree, folderPath)
  fileContents: delete every key === folderPath OR startsWith(folderPath + "/")
  openFiles:    filter same
  recentFiles:  filter same
  activeFile:   if it's the deleted path or a descendant → fall back to openFiles tail or null
```

## 10. Bug-trace

| Symptom                                          | Look at                                                              |
|--------------------------------------------------|----------------------------------------------------------------------|
| New file opens but content shows as loading      | `fileContents[path] === undefined` — sandbox didn't return content. Check `pendingFileReads` and `setOnFileContentSync` handler. |
| Rename succeeds but content gone                 | `fileContents` key migration in reducer (`RENAME_FILE` lines 583-587). |
| Delete folder leaves orphan tabs                 | Prefix filter in `DELETE_FILE` (line 624-628). Verify path uses `+ "/"` to avoid matching unrelated names. |
| New file row icon stays generic                  | `getFileIcon` switch — add a case for the extension.                  |
| Active tab indicator not visible                 | `EditorTabs` requires `activeFile === path` exact equality; check path normalization (no leading slash, etc.). |
| Right-click menu off-screen                      | `clampedX/clampedY` math; `menuHeight` constant might be wrong for new menu items. |
| Refresh icon missing                             | `showRefresh` gate: `mode === "frontend" && isSandboxConnected`.       |
