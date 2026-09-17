# 07 — SearchPanel (find + replace across files) — Deep Dive

File: `components/ide/SearchPanel.tsx` (~430 lines).

Mounted when `activeSidebarPanel === "search"` in `IdeWorkspace.tsx:891-898`. Independent from Monaco's per-file find widget.

---

## 1. Props

```ts
interface SearchPanelProps {
  files: FileNode[];
  fileContents: Record<string, string>;
  onSelectFile: (path: string) => void;
  dispatch: any;                          // workspaceReducer dispatch
}
```

## 2. Local state

```ts
searchQuery, replaceQuery
matchCase, matchWord, useRegex          // toggle buttons
isReplaceVisible                         // collapse the replace row
resultsCollapsed                         // hide all results
expandedFiles: Record<path, boolean>     // per-file expand
showReplaceAllConfirm                    // confirmation guard
```

## 3. Match types

```ts
interface Match {
  line: number;
  text: string;        // full line
  before: string;      // line before match
  match: string;       // matched substring
  after: string;       // line after match
}

interface FileResult {
  path: string;
  matches: Match[];
  isExpanded: boolean;
}
```

`before`/`match`/`after` lets the row render with the match highlighted in-place without re-running matchers per render.

## 4. Search algorithm (`useMemo`, lines 40-76)

```ts
const searchResults = useMemo(() => {
  if (!searchQuery) return [];
  const results: FileResult[] = [];
  const query = matchCase ? searchQuery : searchQuery.toLowerCase();

  Object.entries(fileContents).forEach(([path, content]) => {
    const lines = content.split("\n");
    const matches: Match[] = [];

    lines.forEach((lineText, index) => {
      const target = matchCase ? lineText : lineText.toLowerCase();
      let pos = 0;
      while ((pos = target.indexOf(query, pos)) !== -1) {
        matches.push({
          line: index + 1,
          text: lineText,
          before: lineText.substring(0, pos),
          match: lineText.substring(pos, pos + searchQuery.length),
          after: lineText.substring(pos + searchQuery.length),
        });
        pos += searchQuery.length;
      }
    });

    if (matches.length > 0) {
      results.push({ path, matches, isExpanded: expandedFiles[path] ?? true });
    }
  });

  return results;
}, [searchQuery, fileContents, matchCase, expandedFiles]);
```

**Note**: Current implementation uses simple `indexOf`. The `useRegex`/`matchWord` toggles are wired into the **handleReplaceAll** path (lines 80-94) but **NOT into the search match algorithm itself** — surface change for whoever extends this. To make them functional in search, build a `RegExp` honoring `useRegex` (raw pattern) or `matchWord` (`\b...\b` wrap), then iterate matches via `RegExp` `g` flag and `lastIndex` (guard zero-width via `lastIndex++`).

`totalMatches = searchResults.reduce((acc, r) => acc + r.matches.length, 0)` is rendered in the result count strip ("12 results in 4 files").

## 5. `handleReplaceAll()` (lines 80-94)

```ts
searchResults.forEach((result) => {
  const content = fileContents[result.path];
  const query = matchCase
    ? searchQuery
    : new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), matchCase ? "g" : "gi");
  const newContent = content.replace(query, replaceQuery);
  dispatch({ type: "UPDATE_FILE", payload: { path: result.path, content: newContent } });
});
setShowReplaceAllConfirm(false);
```

Dispatch payload omits `source`. Reducer doesn't require it; downstream sandbox-sync logic that branches on `source: "editor"` won't trigger, which is fine — replace-all is a programmatic write.

`handleReplaceSingle(path, line, matchIndex)` is **a stub** (lines 96-99) — TODO for offset-aware single replace. Currently the per-row Replace button doesn't fully work for partial-line replacements.

## 6. UI structure (lines 102-260)

```
SEARCH header bar (h-9):
  [SEARCH label]   [clear, filter, +file, align, collapse-toggle icons]

Search input row:
  [chevron-toggle replace-row]  [<input search>] [Aa | Ab | .* toggles]

Replace input row (if isReplaceVisible):
  [4-px gap]                   [<input replace>] [AB preserve-case | replace-all]

Results metadata strip:
  "{totalMatches} results in {N} files"   [Open in editor | Search with AI]

Results list:
  for each FileResult:
    [chevron] [file ext badge: TSX/JS/F] [filename] [path/dir muted] [count chip yellow]
    if expanded:
      for each Match:
        before<span match-highlight>match</span>after   ← click → onSelectFile(path)
```

Replace-all confirmation modal (lines 261+) prompts before mutating matches across many files.

## 7. Match highlight CSS

```html
<span class="bg-[#f14c4c]/30 text-white rounded-[1px] px-[1px] border-b border-[#f14c4c]">
  {match.match}
</span>
```

Red-background highlight (#f14c4c at 30% alpha) + bottom border. Mirrors VS Code visual idiom.

## 8. `expandedFiles` semantics

`{ [path]: boolean | undefined }`. Default when undefined: `true` (`expandedFiles[path] ?? true`). Click chevron flips:
```ts
setExpandedFiles(prev => ({ ...prev, [path]: !(prev[path] ?? true) }));
```

## 9. Performance

- Search is **synchronous, blocking, per keystroke**. For tens of files fine; thousands would jank.
- `O(N · L)` where `N` = files, `L` = total lines per file. `indexOf` is `O(M)` per line.

To scale:
- Debounce `searchQuery` 200-300 ms before triggering recompute.
- Move work into a Web Worker — pass `{ files, query, options }`, get `results` back.
- Index file contents into a precomputed inverted index keyed by lowercased trigrams.

## 10. Why client-side, not server grep

- All `fileContents` already live in memory (loaded on sandbox sync). Server round-trip per keystroke would dwarf local search cost.
- Doesn't depend on sandbox running — works on local file state.

## 11. Bug-trace

| Symptom                                              | Look at                                                |
|------------------------------------------------------|--------------------------------------------------------|
| `useRegex`/`matchWord` toggles do nothing in search  | Algorithm doesn't consult them (today only Replace All uses regex). |
| Replace All keeps only first match                   | `content.replace(plainString, ...)` replaces only first. Always build a `RegExp` with `g` flag. |
| Per-row Replace button does nothing                  | `handleReplaceSingle` is stubbed.                      |
| Click row doesn't navigate                           | Verify `result.path` matches key shape used in `fileContents`. |
| Empty results never collapse                         | When query empties, `searchResults` returns `[]`.       |

## 12. "Search with AI" link (line 203)

Currently a placeholder span (`text-blue-400/80 hover:text-blue-400 cursor-pointer`). Wire to `runtime.thread.append({ role: "user", content: \`Search "${searchQuery}" semantically across the project\` })` for the simplest plumbing.
