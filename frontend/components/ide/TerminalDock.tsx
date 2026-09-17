"use client";
import { cn } from "@/lib/utils";
import { TerminalStatus } from "@/types/ide";
import {
  TerminalSquare,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import Editor from "@monaco-editor/react";

interface TerminalDockProps {
  isOpen: boolean;
  logs: string[];
  status: TerminalStatus;
  onClear: () => void;
  onToggle: () => void;
  onExecuteCommand?: (command: string) => void;
}

export function TerminalDock({ isOpen, logs, status, onClear, onToggle, onExecuteCommand }: TerminalDockProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(220);
  const [command, setCommand] = useState("");
  const isResizing = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

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

  if (!isOpen) {
    return (
      <div
        className="h-[36px] bg-zinc-900 border-t border-white/[0.12] flex items-center justify-between px-4 cursor-pointer hover:bg-zinc-800/50 transition-colors z-50 relative"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2 text-zinc-400">
          <TerminalSquare className="w-4 h-4" />
          <span className="text-xs font-mono">Terminal</span>
        </div>
        <ChevronUp className="w-4 h-4 text-zinc-600" />
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className="border-t border-white/[0.12] bg-zinc-950 flex flex-col shrink-0 flex-grow-0 z-50 relative overflow-hidden"
      style={{ height, minHeight: 140 }}
    >
      {/* Resize Handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute left-0 right-0 top-0 h-1 cursor-row-resize z-50 group hover:bg-[#4ee06a]/30 active:bg-[#4ee06a]/50 transition-colors"
      >
        <div className="absolute left-1/2 -translate-x-1/2 top-0 h-0.5 w-8 bg-zinc-700 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Terminal Header */}
      <div className="h-9 bg-zinc-900/50 border-b border-white/[0.12] flex items-center justify-between px-4 select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-zinc-400">
            <TerminalSquare className="w-4 h-4" />
            <span className="text-xs font-medium">Terminal</span>
          </div>
          {status !== "idle" && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700">
              <span className={cn(
                "w-1.5 h-1.5 rounded-full animate-pulse",
                status === "compiling" && "bg-yellow-500",
                status === "deploying" && "bg-[#4ee06a]",
                status === "success" && "bg-green-500",
                status === "error" && "bg-red-500"
              )} />
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                {status}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClear}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Clear Console"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggle}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal Output */}
      <div className="flex-1 min-h-0 relative bg-zinc-950">
        <Editor
          height="100%"
          language="shell"
          theme="vs-dark"
          value={logs.length === 0 ? "Console ready. workspace initialized." : logs.join("\n") + (status === "compiling" ? "\nCompiling..." : "")}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            lineNumbers: "off",
            glyphMargin: false,
            folding: false,
            lineDecorationsWidth: 10,
            lineNumbersMinChars: 0,
            renderLineHighlight: "none",
            scrollbar: {
              vertical: "auto",
              horizontal: "auto",
              useShadows: false,
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
            wordWrap: "on",
            padding: { top: 12, bottom: 12 },
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 13,
            cursorBlinking: "solid",
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
          }}
        />
      </div>

      {/* Terminal Input */}
      {onExecuteCommand && (
        <div className="h-10 min-h-[40px] border-t border-white/[0.12] bg-zinc-950 flex items-center px-3 gap-2 shrink-0 z-10">
          <span className="text-[#4ee06a] font-bold text-sm">❯</span>
          <form
            className="flex-1"
            onSubmit={(e) => {
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
              onChange={(e) => setCommand(e.target.value)}
              className="w-full bg-transparent border-none outline-none text-zinc-300 font-mono text-sm placeholder:text-zinc-700"
              placeholder="Enter command..."
              autoComplete="off"
              spellCheck="false"
            />
          </form>
        </div>
      )}
    </div>
  );
}
