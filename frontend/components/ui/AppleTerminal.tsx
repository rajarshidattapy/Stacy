import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Trash2, Copy, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export type TerminalStatus = "idle" | "compiling" | "deploying" | "success" | "error";

interface AppleTerminalProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  logs: string[];
  status: TerminalStatus;
  onClear: () => void;
}

const statusColors: Record<TerminalStatus, string> = {
  idle: "bg-status-idle",
  compiling: "bg-status-compiling animate-pulse",
  deploying: "bg-status-deploying animate-pulse",
  success: "bg-status-success",
  error: "bg-status-error",
};

const statusLabels: Record<TerminalStatus, string> = {
  idle: "Ready",
  compiling: "Compiling...",
  deploying: "Deploying...",
  success: "Success",
  error: "Error",
};

export function AppleTerminal({
  isOpen,
  onToggleOpen,
  logs,
  status,
  onClear,
}: AppleTerminalProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  return (
    <div className="flex flex-col border-t border-ide-border bg-terminal-bg">
      {/* Header */}
      <div className="flex items-center justify-between h-10 px-3 bg-terminal-header border-b border-ide-border">
        <div className="flex items-center gap-3">
          {/* macOS dots */}
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full macos-dot-close" />
            <div className="w-3 h-3 rounded-full macos-dot-minimize" />
            <div className="w-3 h-3 rounded-full macos-dot-maximize" />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Terminal className="w-4 h-4" />
            <span>Terminal</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={cn("w-2 h-2 rounded-full", statusColors[status])} />
            <span className="text-xs text-muted-foreground">{statusLabels[status]}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClear}
            title="Clear Console"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              navigator.clipboard.writeText(logs.join("\n"));
            }}
            title="Copy logs"
          >
            <Copy className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggleOpen}
            title={isOpen ? "Collapse" : "Expand"}
          >
            {isOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Content */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 200 }}
            exit={{ height: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="overflow-hidden"
          >
            <div
              ref={scrollRef}
              className="h-[200px] overflow-auto p-3 font-mono text-xs scrollbar-thin"
            >
              {logs.map((log, index) => (
                <div
                  key={index}
                  className={cn(
                    "leading-relaxed",
                    log.includes("error") || log.includes("Error")
                      ? "text-status-error"
                      : log.includes("✓") || log.includes("success") || log.includes("complete") || log.includes("deployed")
                      ? "text-status-success"
                      : log.includes("warning")
                      ? "text-status-compiling"
                      : "text-muted-foreground"
                  )}
                >
                  {log}
                </div>
              ))}
              {logs.length === 0 && (
                <div className="text-muted-foreground/50 italic">
                  No output yet. Run a command to see results.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
