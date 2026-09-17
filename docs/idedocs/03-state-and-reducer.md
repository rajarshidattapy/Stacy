# 03 — State Shape & `workspaceReducer` (Deep Dive)

State for the IDE is held in **two `useReducer` instances** in `components/generate/Generate.tsx` — one per IDE mode. Both call the same `workspaceReducer`. This chapter inventories every type, every action, every helper, and every reducer case down to line numbers.

---

## 1. Types — `types/ide.ts`

```ts
export type IdeMode = "contract" | "frontend";
export type TerminalStatus = "idle" | "compiling" | "deploying" | "success" | "error";
export type ChatTargetMode = "auto" | "contract" | "frontend";

export interface FileNode {
  id: string;            // full path (acts as primary key)
  name: string;          // last segment
  type: "file" | "folder";
  children?: FileNode[]; // populated only when type === "folder"
  isOpen?: boolean;      // folder UI hint (not load-bearing — FileExplorer holds its own expansion state)
}

export interface DeployedContract {
  id: string;
  name: string;
  address: string;
  deployedAt: string;     // ISO string
  network: "testnet";
  wasmHash?: string;
}

export interface WorkspaceState {
  mode: IdeMode;
  fileTree: FileNode[];
  openFiles: string[];               // tab order
  activeFile: string | null;          // currently rendered in Monaco
  recentFiles?: string[];             // most-recent-first, capped at 20 entries
  fileContents: Record<string, string>;
  terminalLogs: string[];
  terminalStatus: TerminalStatus;
  ui: {
    isFileExplorerOpen: boolean;
    isActionPanelOpen: boolean;
    isTerminalOpen: boolean;
    isPreviewMode: boolean;
  };
}

export interface ChatContext {
  targetMode: ChatTargetMode;
  resolvedMode: IdeMode;
  activeFilePath?: string;
  selection?: { startLine: number; endLine: number; selectedText: string };
  intent?: "general" | "fix" | "explain" | "optimize" | "debug";
}
```

### Why path-as-id

Every `FileNode.id` and every `fileContents` key is the **full path from the workspace root**. This means:
- `openFiles[]`, `activeFile`, `recentFiles[]` all use full paths.
- Tab close/select, content lookup, search, sandbox sync all share one key shape.
- Renaming requires *both* tree update AND `fileContents` key migration AND `openFiles` mapping (handled in `RENAME_FILE` reducer case below).

## 2. `Action` discriminated union — `Generate.tsx:380-421`

```ts
type Action =
  | { type: "OPEN_FILE";  payload: string }
  | { type: "CLOSE_FILE"; payload: string }
  | { type: "UPDATE_FILE"; payload: { path: string; content: string; source?: "editor" | "system" } }
  | { type: "TOGGLE_EXPLORER" }
  | { type: "TOGGLE_ACTION_PANEL" }
  | { type: "TOGGLE_TERMINAL" }
  | { type: "TOGGLE_PREVIEW" }
  | { type: "SET_TERMINAL_STATUS"; payload: WorkspaceState["terminalStatus"] }
  | { type: "ADD_LOG"; payload: string }
  | { type: "CLEAR_LOGS" }
  | { type: "ADD_BINDINGS_FILE"; payload: { name: string; content: string } }
  | { type: "ADD_FILE";   payload: { parentPath: string; fileName: string; content?: string } }
  | { type: "ADD_FOLDER"; payload: { parentPath: string; folderName: string } }
  | { type: "RENAME_FILE";payload: { oldPath: string; newName: string } }
  | { type: "DELETE_FILE";payload: { path: string } }
  | { type: "SYNC_FILE_TREE";    payload: FileNode[] }
  | { type: "SYNC_FILE_CONTENT"; payload: { path: string; content: string } }
  | { type: "MARK_FILE_LOADING"; payload: string }
  | { type: "LOAD_PROJECT"; payload: WorkspaceState }
  | { type: "RESET_IDE";    payload: { mode: IdeMode } };
```

## 3. Reducer cases — line by line (`Generate.tsx:423-702`)

### `LOAD_PROJECT` (lines 428-440)

Re-hydrates a saved project. If `payload.recentFiles` is undefined, synthesize:
```ts
fallbackRecentFiles =
  activeFile ? [activeFile, ...openFiles.filter(f => f !== activeFile)] : openFiles
```

### `RESET_IDE` (lines 441-444)

Returns a fresh shallow copy of `INITIAL_CONTRACT_STATE` or `INITIAL_FRONTEND_STATE`. Note: shallow `{ ...INITIAL }` — nested objects (`ui`, arrays) are shared until the next mutation produces a new reference. Safe because subsequent updates always create new objects.

### `OPEN_FILE` (lines 445-461)

```ts
const recentFiles = [path, ...recentFiles.filter(f => f !== path)].slice(0, 20);
if (!openFiles.includes(path)) {
  return { ...state, recentFiles, openFiles: [...openFiles, path], activeFile: path };
}
return { ...state, recentFiles, activeFile: path };
```

`recentFiles` is bounded at 20 items, most-recent-first, deduplicated. Used by `IdeHeader`'s file search to surface recents when query is empty (`IdeHeader.tsx:75-79`).

### `CLOSE_FILE` (lines 462-471)

If closing the active tab, fall back to the **last** remaining tab (LIFO):
```ts
activeFile: state.activeFile === payload ? newOpen[newOpen.length - 1] || null : state.activeFile
```

### `UPDATE_FILE` (lines 472-479)

```ts
return { ...state, fileContents: { ...state.fileContents, [path]: content } };
```

The `source` field is **NOT consumed by the reducer** — it's a sideband annotation read by upstream effects in `Generate.tsx` (e.g., `syncFileToSandbox` only fires for `source: "editor"`). Reducer just stores content.

### `TOGGLE_EXPLORER` / `TOGGLE_ACTION_PANEL` / `TOGGLE_TERMINAL` / `TOGGLE_PREVIEW` (lines 480-499)

Plain boolean flips on `state.ui.*`. Each returns a new `state.ui` object so React diffs cheaply.

### `SET_TERMINAL_STATUS` (line 500-501)

Status pill driver. Set by an effect in `Generate.tsx:842-865` that watches `stellarIDE.isCompiling`/`isDeploying`/`compiler.status`/`deployer.status`.

### `ADD_LOG` / `CLEAR_LOGS` (lines 502-508)

`CLEAR_LOGS` reseeds with `["Console cleared."]` (NOT empty array) so the terminal never looks blank.

### `ADD_BINDINGS_FILE` (lines 509-531)

Specialized AI-write that:
1. Calls `ensureFilePathInTree(state.fileTree, filePath)` — auto-creates any missing parent folders.
2. Pushes path to top of `recentFiles` (capped 20).
3. Sets `fileContents[filePath] = content`.
4. Adds to `openFiles` if not already.
5. Sets `activeFile = filePath` — auto-focuses the new file.

Called when bindings generation completes — pulls user attention to the generated TS file.

### `ADD_FILE` (lines 532-559)

```ts
newTree = addFileToTree(state.fileTree, parentPath, fileName);
newFilePath = parentPath ? `${parentPath}/${fileName}` : fileName;
fileContents[newFilePath] = payload.content || "";
openFiles += newFilePath, activeFile = newFilePath
```

### `ADD_FOLDER` (lines 560-570)

`addFolderToTree(state.fileTree, parentPath, folderName)` — adds an empty `children: []` folder node. Does NOT touch `fileContents`.

### `RENAME_FILE` (lines 571-608)

Triple update:
1. Tree: `renameNodeInTree(tree, oldPath, newName)` — also updates IDs of all descendants if it's a folder.
2. `fileContents`: copy under new key, `delete` old key.
3. `openFiles`: `.map(f => f === oldPath ? newPath : f)`.
4. `recentFiles`: same map.
5. `activeFile`: swap if it was the renamed path.

The new path is computed by replacing the **last** segment of `oldPath.split("/")` — not by string concat, so `a/b/c` renamed to `d` becomes `a/b/d` cleanly.

### `DELETE_FILE` (lines 609-651)

Folder-aware delete. Removes:
1. The node from `fileTree` (`deleteNodeFromTree`).
2. From `fileContents`: the exact path AND every key starting with `${path}/` (folder contents).
3. From `openFiles`: same prefix filter.
4. From `recentFiles`: same prefix filter.
5. `activeFile`: if it's the deleted path or under the deleted folder → fall back to `newOpenFiles[newOpenFiles.length - 1] || null`.

### `SYNC_FILE_TREE` (lines 653-674)

Replace tree + reconcile state with tree's valid paths:

```ts
const validPaths = new Set(getAllFilePaths(newTree));
reconciledOpen   = openFiles.filter(p => validPaths.has(p));
reconciledRecent = recentFiles.filter(p => validPaths.has(p));
reconciledActive = activeFile && validPaths.has(activeFile)
                     ? activeFile
                     : reconciledOpen[reconciledOpen.length - 1] || null;
```

Files removed in the sandbox disappear from tabs and recents automatically.

### `SYNC_FILE_CONTENT` (lines 676-684)

Same shape as `UPDATE_FILE` but used for sandbox-driven content updates. Doesn't dirty `pendingAIChanges`.

### `MARK_FILE_LOADING` (lines 686-698)

Defensive placeholder: only sets `"// Loading file content..."` if no content is cached yet. Prevents flashing the placeholder over real content during a re-fetch.

### `default` (line 699-700)

Returns `state` unchanged.

## 4. Initial states — `Generate.tsx`

`INITIAL_CONTRACT_STATE` (line 59):
```ts
{
  mode: "contract",
  fileTree: [], openFiles: [], activeFile: null, recentFiles: [], fileContents: {},
  terminalLogs: ["Contract workspace ready. Waiting for sandbox..."],
  terminalStatus: "idle",
  ui: { isFileExplorerOpen: true, isActionPanelOpen: true, isTerminalOpen: true, isPreviewMode: false }
}
```

`INITIAL_FRONTEND_STATE` (around line 200) is similarly empty but seeds a few placeholder files (`app/page.tsx`, `app/layout.tsx`, `package.json`) for users who haven't connected to a sandbox yet — gives the IDE something visible immediately.

## 5. Helpers consumed by reducer — `lib/fileTreeUtils.ts`

| Function                                | Behavior                                                                                                  |
|-----------------------------------------|-----------------------------------------------------------------------------------------------------------|
| `findNodeByPath(tree, path)`            | DFS by `name`-segments; returns `{ node, parent, index } \| null`. Cannot traverse into a file.            |
| `cloneFileTree(tree)`                   | Recursive shallow-deep clone (`{...node, children: cloneFileTree(node.children)}`). Used by every mutation to keep React happy. |
| `addFileToTree(tree, parentPath, fileName)` | Clones, finds parent, pushes a `{ id: fullPath, name, type: "file" }` node into `parent.children`. Returns clone unchanged if parent missing or not a folder. |
| `addFolderToTree(tree, parentPath, folderName)` | Same shape with `type: "folder", children: []`.                                                  |
| `renameNodeInTree(tree, oldPath, newName)` | Updates `name`, recomputes `id` from `oldPath.split("/")` swapping last segment, and recursively re-IDs all children if folder. |
| `deleteNodeFromTree(tree, path)`        | Finds the parent then `splice`s the child. Root nodes splice off the cloned root array directly.           |
| `getAllFilePaths(tree)`                 | Recursive collection of all `id`s of file-typed nodes. Used by `IdeHeader` search and `SYNC_FILE_TREE` reconcile. |
| `ensureFilePathInTree(tree, filePath)`  | For each segment, `addFolderToTree` if missing; finally `addFileToTree`. Used by `ADD_BINDINGS_FILE`.       |
| `pathExists(tree, path)`                | `findNodeByPath !== null`.                                                                                 |
| `getParentPath(path)` / `getNameFromPath(path)` | String utilities.                                                                                  |
| `isValidName(name)`                     | Validates: non-empty, no `/` or `\`, not a Windows reserved name (`CON`, `PRN`, `LPT1`…), no control chars `[<>:"\|?*\x00-\x1F]`, no leading/trailing whitespace. Returns `{ valid, error? }`. |
| `nameExistsInParent(tree, parentPath, name)` | Used by `FileExplorer` inline-rename and add input to validate uniqueness.                            |
| `moveNodeInTree(tree, sourcePath, targetParentPath, newName?)` | Drag-and-drop helper (currently unused in IDE UI, available for future).             |
| `getAllNodes(tree)` / `getNodeDepth(tree, path)` | Pure utilities.                                                                                |

All mutations clone the tree first — never mutate input. This is important for React's referential equality checks; shared sub-arrays would silently break re-renders.

## 6. Why two reducers, not one?

`Generate.tsx`:

```ts
const [contractState, dispatchContract] = useReducer(workspaceReducer, INITIAL_CONTRACT_STATE);
const [frontendState, dispatchFrontend] = useReducer(workspaceReducer, INITIAL_FRONTEND_STATE);
```

Reasons:

1. **Independent open tabs**: switching to frontend mode shouldn't lose your contract tab order.
2. **Independent terminal logs**: cargo build noise would drown out Next.js dev server messages if combined.
3. **Independent active file**: Cmd+P in contract mode shouldn't show frontend results.
4. **Path-prefix routing is trivial**: `setOnFileTreeSync` fan-outs by prefix (`contracts/...` vs `frontend/...`), no merge needed.

The page picks which one is "current" via:

```ts
const currentVisibleWorkspace = ideMode === "contract" ? contractState : frontendState;
const currentDispatch         = ideMode === "contract" ? dispatchContract : dispatchFrontend;
```

For chat, `targetMode` (`"auto" | "contract" | "frontend"`) lets the user override:

```ts
const resolvedMode = targetMode === "auto" ? ideMode : targetMode;
const activeWorkspace = resolvedMode === "contract" ? contractState : frontendState;
```

So the user can be visually in frontend mode but tell the AI "fix the contract" by setting target mode.

## 7. State held *outside* the reducers (in `Generate.tsx`)

These are cross-cutting or orchestration-only:

| State                       | Why not in reducer                                                          |
|-----------------------------|-----------------------------------------------------------------------------|
| `interactionMode`           | Toggles which RIGHT panel renders (manual vs agentic). Not workspace-shaped.|
| `ideMode`                   | The selector itself.                                                        |
| `currentProjectId/Name/lastSavedAt` | Persistence metadata.                                               |
| `isProjectsModalOpen` / `isVersionsModalOpen` / `isEnvConfigOpen` / `isSaveDialogOpen` | Modal flags. |
| `projectSessionKey`         | Bumped on project load to force `<Editor key=…/>` remount.                 |
| `isSaving`, `isChatCollapsed`, `isHomeSidebarOpen` | UI-only.                                              |
| `deployedContracts: DeployedContract[]` | Cross-mode (contract deploys but frontend uses bindings).        |
| `pendingAIChanges`          | Queued AI diffs — cross-mode.                                               |
| `codeSelection`             | Last user selection from Monaco's CodeSelectionPopup, with `intent`.        |
| `targetMode`                | Chat mode override.                                                         |
| `monacoSyncRef` / `forceModelContentRef` | Ref bridges — not state.                                       |
| `lastSyncedLogIndex` / `pendingFileReads` / `fileContentsRef` / `contractFileContentsRef` | Refs to sidestep stale closures and avoid render loops. |

## 8. Common subtle bugs around this state

- **Stale closure in `handleCompile`**: solved by `contractFileContentsRef.current` (`Generate.tsx:761-771`). `useReducer` state in a `useCallback` deps array would still close over the snapshot at render time; the ref is the escape hatch.
- **Sandbox sync overwriting unsaved Monaco edits**: solved by calling `monacoSyncRef.current()` (which calls `syncMonacoToWorkspace` from `IdeWorkspace.tsx`) BEFORE compile/sync to flush Monaco view content into reducer state.
- **Renamed file losing content**: `RENAME_FILE` migrates the `fileContents` key explicitly (lines 583-587). If you skip that step in any new variant of rename (e.g., a "duplicate" action), content will look "lost" because the new key has no entry.
- **DELETE leaves orphan tabs**: prevented by the `f.startsWith(path + "/")` filter (line 624-628). When adding new path-aware actions, mirror this folder-prefix logic.
