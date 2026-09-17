"use client";
import { cn } from "@/lib/utils";
import { TerminalStatus } from "@/types/ide";
import {
  ChevronUp,
  Clipboard,
  Trash2,
  X,
  SquareTerminal,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";

interface LogDockProps {
  isOpen: boolean;
  logs: string[];
  status: TerminalStatus;
  onClear: () => void;
  onToggle: () => void;
  onExecuteCommand?: (command: string) => void;
}

type Tab = "logs" | "terminal";

interface ParsedLine {
  raw: string;
  timestamp: string | null;
  badge: string | null;
  badgeType: "SERVER" | "CLIENT" | "ERROR" | "WARN" | null;
  message: string;
  isWarning: boolean;
  isError: boolean;
}

function parseLine(line: string): ParsedLine {
  // match: "23:48:47.134Z [SERVER] message" or ISO timestamp prefix
  const tsMatch = line.match(/^(\d{2}:\d{2}:\d{2}\.\d+Z?|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s*/);
  const ts = tsMatch ? tsMatch[1] : null;
  const afterTs = ts ? line.slice(tsMatch![0].length) : line;

  const badgeMatch = afterTs.match(/^\[(\w+)\]\s*/);
  const badge = badgeMatch ? badgeMatch[1] : null;
  const message = badge ? afterTs.slice(badgeMatch![0].length) : afterTs;

  const badgeUpper = badge?.toUpperCase();
  let badgeType: ParsedLine["badgeType"] = null;
  if (badgeUpper === "SERVER") badgeType = "SERVER";
  else if (badgeUpper === "CLIENT") badgeType = "CLIENT";
  else if (badgeUpper === "ERROR") badgeType = "ERROR";
  else if (badgeUpper === "WARN" || badgeUpper === "WARNING") badgeType = "WARN";

  const isError = badgeType === "ERROR" || /error/i.test(message.slice(0, 30));
  const isWarning = badgeType === "WARN" || /warn/i.test(message.slice(0, 30));

  return { raw: line, timestamp: ts, badge, badgeType, message, isWarning, isError };
}

const BADGE_CLASSES: Record<NonNullable<ParsedLine["badgeType"]>, string> = {
  SERVER: "bg-zinc-700 text-zinc-300",
  CLIENT: "bg-blue-900/60 text-blue-300",
  ERROR:  "bg-red-900/60 text-red-300",
  WARN:   "bg-amber-900/60 text-amber-300",
};

export function LogDock({ isOpen, logs, status, onClear, onToggle, onExecuteCommand }: LogDockProps) {
  const [tab, setTab] = useState<Tab>("logs");
  const [filter, setFilter] = useState("");
  const [height, setHeight] = useState(240);
  const [command, setCommand] = useState("");
  const isResizing = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isOpen, tab]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current || !panelRef.current) return;
      const panelRect = panelRef.current.getBoundingClientRect();
      const newHeight = panelRect.bottom - e.clientY;
      setHeight(Math.max(140, Math.min(600, newHeight)));
    };
    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const parsed = useMemo(() => logs.map(parseLine), [logs]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return parsed;
    return parsed.filter(l => l.raw.toLowerCase().includes(q));
  }, [parsed, filter]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(logs.join("\n")).catch(() => {});
  }, [logs]);

  if (!isOpen) {
    return (
      <div
        className="h-8 bg-[#09090b] border-t border-white/[0.08] flex items-center justify-between px-3 cursor-pointer hover:bg-white/[0.02] transition-colors z-50 relative"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2 text-zinc-500">
          <SquareTerminal className="w-3.5 h-3.5" data-testid="geist-icon" />
          <span className="text-[11px] font-medium">Terminal</span>
        </div>
        <ChevronUp className="w-3 h-3 text-zinc-600" />
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className="border-t border-white/[0.12] bg-[#0d0d0d] flex flex-col shrink-0 z-50 relative overflow-hidden"
      style={{ height, minHeight: 140 }}
    >
      {/* Resize Handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute left-0 right-0 top-0 h-1 cursor-row-resize z-50 group hover:bg-[#4ee06a]/30 active:bg-[#4ee06a]/50 transition-colors"
      >
        <div className="absolute left-1/2 -translate-x-1/2 top-0 h-0.5 w-8 bg-zinc-700 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Header: tabs + filter + actions */}
      <div className="h-9 bg-[#111111] border-b border-white/[0.08] flex items-center justify-between px-3 select-none shrink-0">
        {/* Tabs */}
        <div className="flex items-center gap-0">
          {(["logs", "terminal"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 h-9 text-[12px] font-medium border-b-2 transition-colors capitalize",
                tab === t
                  ? "border-white/60 text-zinc-200"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              )}
            >
              {t === "logs" ? "Logs" : "Terminal"}
            </button>
          ))}
          {status !== "idle" && (
            <div className="ml-3 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700">
              <span className={cn(
                "w-1.5 h-1.5 rounded-full animate-pulse",
                status === "compiling" && "bg-yellow-500",
                status === "deploying" && "bg-[#4ee06a]",
                status === "success" && "bg-green-500",
                status === "error" && "bg-red-500"
              )} />
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">{status}</span>
            </div>
          )}
        </div>

        {/* Right: filter + actions */}
        <div className="flex items-center gap-1">
          {tab === "logs" && (
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter..."
              className="h-6 px-2 rounded bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500 w-32 font-mono"
            />
          )}
          <button onClick={handleCopy} className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="Copy">
            <Clipboard className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClear} className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="Clear">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onToggle} className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="Close">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Logs tab */}
      {tab === "logs" && (
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto font-mono text-[12px]"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-zinc-600 text-center text-[11px]">No logs yet</div>
          ) : (
            filtered.map((line, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2 px-3 py-[3px] border-b border-white/[0.03] group hover:bg-white/[0.03]",
                  line.isError && "bg-red-950/30 hover:bg-red-950/40",
                  line.isWarning && !line.isError && "bg-amber-950/30 hover:bg-amber-950/40",
                )}
              >
                {line.timestamp && (
                  <span className="shrink-0 text-zinc-600 text-[11px] pt-[1px] tabular-nums">
                    {line.timestamp}
                  </span>
                )}
                {line.badge && (
                  <span className={cn(
                    "shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded",
                    line.badgeType ? BADGE_CLASSES[line.badgeType] : "bg-zinc-700 text-zinc-300"
                  )}>
                    [{line.badge}]
                  </span>
                )}
                <span className={cn(
                  "flex-1 leading-relaxed break-all whitespace-pre-wrap",
                  line.isError ? "text-red-300" : line.isWarning ? "text-amber-300" : "text-zinc-300"
                )}>
                  {line.message || line.raw}
                </span>
              </div>
            ))
          )}
          {status === "compiling" && (
            <div className="px-3 py-[3px] text-zinc-500 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
              Compiling…
            </div>
          )}
        </div>
      )}

      {/* Terminal tab */}
      {tab === "terminal" && (
        <div className="flex-1 min-h-0 flex flex-col bg-[#0a0a0a]">
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto px-3 py-2 font-mono text-[12px]"
            style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}
          >
            {logs.length === 0 ? (
              <div className="flex items-center gap-1.5 text-[#4ee06a]/60">
                <span className="text-[#4ee06a]">❯</span>
                <span>Console ready.</span>
              </div>
            ) : (
              logs.map((line, i) => {
                const p = parseLine(line);
                const lineColor = p.isError
                  ? "text-red-400"
                  : p.isWarning
                  ? "text-amber-400"
                  : p.badge === "SERVER"
                  ? "text-[#4ee06a]"
                  : p.badge === "CLIENT"
                  ? "text-blue-400"
                  : "text-zinc-200";
                return (
                  <div key={i} className="flex items-start gap-2 py-[1px] leading-[1.6]">
                    {p.timestamp && (
                      <span className="shrink-0 text-zinc-600 text-[10px] pt-[2px] tabular-nums select-none">
                        {p.timestamp}
                      </span>
                    )}
                    <span className={cn("flex-1 break-all whitespace-pre-wrap", lineColor)}>
                      {p.badge ? (
                        <>
                          <span className={cn(
                            "mr-1.5 text-[10px] font-bold px-1 py-0.5 rounded",
                            p.badgeType ? BADGE_CLASSES[p.badgeType] : "bg-zinc-700 text-zinc-300"
                          )}>
                            [{p.badge}]
                          </span>
                          {p.message || p.raw}
                        </>
                      ) : (
                        p.raw
                      )}
                    </span>
                  </div>
                );
              })
            )}
            {status === "compiling" && (
              <div className="flex items-center gap-2 py-[1px] text-yellow-400">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse shrink-0" />
                <span>Compiling…</span>
              </div>
            )}
          </div>
          {onExecuteCommand && (
            <div className="h-10 border-t border-white/[0.08] bg-[#050505] flex items-center px-3 gap-2 shrink-0">
              <span className="text-[#4ee06a] font-bold text-sm select-none">❯</span>
              <form
                className="flex-1"
                onSubmit={e => {
                  e.preventDefault();
                  if (command.trim()) {
                    onExecuteCommand(command.trim());
                    setCommand("");
                  }
                }}
              >
                <input
                  type="text"
                  value={command}
                  onChange={e => setCommand(e.target.value)}
                  className="w-full bg-transparent border-none outline-none text-[#4ee06a] font-mono text-[12px] placeholder:text-zinc-700 caret-[#4ee06a]"
                  placeholder="Enter command…"
                  autoComplete="off"
                  spellCheck={false}
                />
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}






















