# 10 — Logs / Terminal (`LogDock`) — Deep Dive

File: `components/ide/LogsDock.tsx` (~340 lines). Mounted at the bottom of the IDE workspace below the editor area in `IdeWorkspace.tsx:988-995`.

---

## 1. Tabs

```ts
type Tab = "logs" | "terminal";
```

- **Logs** — read-only formatted log viewer; lines come from `workspace.terminalLogs`.
- **Terminal** — single-line input + scrollback. On Enter, calls `onExecuteCommand(cmd)` → sandbox `executeCommand`.

## 2. Props

```ts
interface LogDockProps {
  isOpen: boolean;
  logs: string[];
  status: TerminalStatus;
  onClear: () => void;
  onToggle: () => void;
  onExecuteCommand?: (command: string) => void;
}
```

## 3. Local state

```ts
tab: Tab = "logs"
filter: string                  // log filter input
height: number = 240             // px, drag-resizable [140, 600]
command: string                  // terminal input
isResizing: useRef(boolean)
panelRef:   useRef<HTMLDivElement>
scrollRef:  useRef<HTMLDivElement>
```

## 4. Auto-scroll (lines 73-77)

```ts
useEffect(() => {
  if (scrollRef.current) {
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }
}, [logs, isOpen, tab]);
```

Pins to bottom whenever new logs arrive, the dock is opened, or tab changes.

## 5. Resize (lines 79-104)

```ts
handleMouseDown(e):
  isResizing.current = true
  body.cursor = "row-resize"
  body.userSelect = "none"

useEffect mousemove:
  if (!isResizing.current || !panelRef.current) return
  const panelRect = panelRef.current.getBoundingClientRect()
  const newHeight = panelRect.bottom - e.clientY
  setHeight(Math.max(140, Math.min(600, newHeight)))

useEffect mouseup → isResizing.current = false; body.cursor = ""; userSelect = ""
```

`newHeight = panelRect.bottom - e.clientY` is height-from-bottom-of-panel-to-cursor. Drag UP increases height.

## 6. `parseLine(line)` (lines 34-55)

```ts
interface ParsedLine {
  raw: string;
  timestamp: string | null;
  badge: string | null;
  badgeType: "SERVER" | "CLIENT" | "ERROR" | "WARN" | null;
  message: string;
  isWarning: boolean;
  isError: boolean;
}
```

Algorithm:
```ts
// Match ISO-style timestamp at start
const tsMatch = line.match(/^(\d{2}:\d{2}:\d{2}\.\d+Z?|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s*/);
const ts = tsMatch ? tsMatch[1] : null;
const afterTs = ts ? line.slice(tsMatch[0].length) : line;

// Match [BADGE]
const badgeMatch = afterTs.match(/^\[(\w+)\]\s*/);
const badge = badgeMatch ? badgeMatch[1] : null;
const message = badge ? afterTs.slice(badgeMatch[0].length) : afterTs;

const badgeUpper = badge?.toUpperCase();
let badgeType = null;
if (badgeUpper === "SERVER")              badgeType = "SERVER";
else if (badgeUpper === "CLIENT")         badgeType = "CLIENT";
else if (badgeUpper === "ERROR")          badgeType = "ERROR";
else if (badgeUpper === "WARN" || badgeUpper === "WARNING") badgeType = "WARN";

const isError   = badgeType === "ERROR" || /error/i.test(message.slice(0, 30));
const isWarning = badgeType === "WARN"  || /warn/i.test(message.slice(0, 30));
```

`isError`/`isWarning` use both badge and content sniffing (first 30 chars). Rows highlight accordingly.

## 7. Badge color map (lines 57-62)

```ts
const BADGE_CLASSES = {
  SERVER: "bg-zinc-700 text-zinc-300",
  CLIENT: "bg-blue-900/60 text-blue-300",
  ERROR:  "bg-red-900/60 text-red-300",
  WARN:   "bg-amber-900/60 text-amber-300",
};
```

Other badge text (e.g., `[cargo]`, `[deploy]`, `[bindings]`, `[next]`, `[cmd]`, `[sync]`, `[project]`) renders with default `bg-zinc-700 text-zinc-300`.

## 8. Filtering (lines 108-112)

```ts
const filtered = useMemo(() => {
  const q = filter.trim().toLowerCase();
  if (!q) return parsed;
  return parsed.filter(l => l.raw.toLowerCase().includes(q));
}, [parsed, filter]);
```

Case-insensitive substring filter on the raw line. No regex, no badge filter (yet).

## 9. Closed state (lines 118-131)

When `!isOpen`, renders a thin 32 px clickable bar:

```tsx
<div onClick={onToggle} className="h-8 bg-[#09090b] border-t hover:bg-white/[0.02]">
  <SquareTerminal/> Terminal
  <ChevronUp/>
</div>
```

## 10. Open state header (lines 148-199)

```
h-9 header:
  Tabs: [Logs] [Terminal] (active = bottom border, inactive = transparent)
  Status pill (only if status !== "idle"):
    "compiling" → yellow pulse
    "deploying" → green pulse
    "success"   → green
    "error"     → red

  Right side:
    if tab === "logs": <input filter placeholder="Filter..."/>
    [Clipboard copy] [Trash2 clear] [X close]
```

Copy: `navigator.clipboard.writeText(logs.join("\n"))`.
Clear: `onClear()` → `dispatch({ type: "CLEAR_LOGS" })` → reseeds `terminalLogs = ["Console cleared."]`.

## 11. Logs tab body (lines 201-249)

For each filtered line:
```tsx
<div className={cn(
  "flex items-start gap-2 px-3 py-[3px] border-b border-white/[0.03] group hover:bg-white/[0.03]",
  line.isError                && "bg-red-950/30 hover:bg-red-950/40",
  line.isWarning && !line.isError && "bg-amber-950/30 hover:bg-amber-950/40",
)}>
  {line.timestamp && <span className="text-zinc-600 text-[11px] tabular-nums">{line.timestamp}</span>}
  {line.badge     && <span className={BADGE_CLASSES[line.badgeType] || "bg-zinc-700"}>[{line.badge}]</span>}
  <span className={line.isError ? "text-red-300" : line.isWarning ? "text-amber-300" : "text-zinc-300"}>{line.message || line.raw}</span>
</div>
```

Footer: when `status === "compiling"`, an active "Compiling…" line appears below the list with a pulsing yellow dot.

## 12. Terminal tab body (further down in file)

Single-line input at the bottom; on Enter:
```ts
onKeyDown={(e) => {
  if (e.key === "Enter" && command.trim() && onExecuteCommand) {
    onExecuteCommand(command.trim());
    setCommand("");
  }
}}
```

`onExecuteCommand` plumbed from `IdeWorkspace.props.onExecuteCommand` → `Generate.tsx:2044-2049`:

```tsx
onExecuteCommand={(command) =>
  stellarIDE.sandbox.executeCommand(
    command,
    ideMode === "contract" ? "/workspace/contracts" : "/workspace/frontend"
  )
}
```

`cwd` switches based on mode — contract commands run in `/workspace/contracts`, frontend in `/workspace/frontend`.

Output streams back as `[cmd]` log lines, routed by the log-routing effect to the appropriate mode's `terminalLogs`.

## 13. Log routing (`Generate.tsx:818-839`)

```ts
useEffect(() => {
  const newLogs = stellarIDE.allLogs.slice(lastSyncedLogIndex.current);
  if (newLogs.length > 0) {
    newLogs.forEach((log) => {
      if (/^\[next\]/i.test(log))                          return;     // dropped
      if (/^\[(cargo|compile|deploy|bindings)\]/i.test(log)) {
        dispatchContract({ type: "ADD_LOG", payload: log });
      } else {
        if (ideMode === "contract") dispatchContract({ type: "ADD_LOG", payload: log });
        else                        dispatchFrontend({ type: "ADD_LOG", payload: log });
      }
    });
    lastSyncedLogIndex.current = stellarIDE.allLogs.length;
  }
}, [stellarIDE.allLogs, ideMode]);
```

Why `lastSyncedLogIndex.current` instead of state: avoids re-running the effect on its own state changes (would race with `allLogs` updates).

| Prefix                                    | Routed to            | Reason                              |
|-------------------------------------------|----------------------|-------------------------------------|
| `[cargo]`, `[compile]`, `[deploy]`, `[bindings]` | Contract terminal | Always contract-scoped operations.   |
| `[next]`                                  | Dropped              | npm dev server output noise.        |
| `[cmd]`, `[sync]`, anything else          | Active mode terminal | User-initiated or context-relative. |

## 14. Status pill driver (`Generate.tsx:842-865`)

Watches compiler/deployer status and folds into `terminalStatus`:

```ts
useEffect(() => {
  if      (stellarIDE.isCompiling)                                                  dispatchContract({ type: "SET_TERMINAL_STATUS", payload: "compiling" });
  else if (stellarIDE.isDeploying)                                                  dispatchContract({ type: "SET_TERMINAL_STATUS", payload: "deploying" });
  else if (compiler.status === "SUCCESS" || deployer.status === "SUCCESS")          dispatchContract({ type: "SET_TERMINAL_STATUS", payload: "success" });
  else if (compiler.status === "ERROR"   || deployer.status === "ERROR")            dispatchContract({ type: "SET_TERMINAL_STATUS", payload: "error" });
  else                                                                              dispatchContract({ type: "SET_TERMINAL_STATUS", payload: "idle" });
}, [stellarIDE.isCompiling, stellarIDE.isDeploying, compiler.status, deployer.status]);
```

Frontend mode's `terminalStatus` is currently never set (always `"idle"`) — wire to sandbox status if you want a frontend pill.

## 15. Bug-trace

| Symptom                                           | Look at                                                         |
|---------------------------------------------------|-----------------------------------------------------------------|
| Logs going to wrong tab                           | Routing useEffect in `Generate.tsx:818-839`. Add prefix branch. |
| Bad parsing of badges                             | `parseLine` regex. `\w+` doesn't match hyphenated badges like `[my-tool]`. Update to `[\w-]+`. |
| Terminal input does nothing                       | `onExecuteCommand` prop not wired or `command.trim()` empty.    |
| Logs missing after page reload                    | In-memory only — `terminalLogs` is not persisted.                |
| Status pill stuck on "compiling"                  | Compiler status never transitioned. Check `useCompiler` reducer.|
| Filter case-sensitive                             | It's lowercased — `l.raw.toLowerCase().includes(q)`.             |
| Resize jumps                                      | `panelRect.bottom - e.clientY` — verify `panelRef` attached.     |
| Auto-scroll fights manual scroll                  | Effect runs on every `logs` change; add a "user scrolled up" guard if needed. |
