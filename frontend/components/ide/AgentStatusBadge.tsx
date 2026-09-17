"use client";

import { cn } from "@/lib/utils";
import type { AgentStatus, AgentTokenUsage } from "@/hooks/useAgentState";

interface AgentStatusBadgeProps {
  status: AgentStatus;
  currentTool: string | null;
  currentFile: string | null;
  retryCount: number;
  maxRetries: number;
  retryReason: string | null;
  tokenUsage: AgentTokenUsage | null;
  lastError: { message: string; code: string; recoverable: boolean } | null;
}

const STATUS_CONFIG: Record<
  AgentStatus,
  { label: string; color: string; pulse: boolean }
> = {
  idle: { label: "IDLE", color: "bg-zinc-500", pulse: false },
  thinking: { label: "THINKING", color: "bg-blue-500", pulse: true },
  executing: { label: "EXECUTING", color: "bg-amber-500", pulse: true },
  validating: { label: "VALIDATING", color: "bg-[#4ee06a]", pulse: true },
  retrying: { label: "RETRYING", color: "bg-orange-500", pulse: true },
  error: { label: "ERROR", color: "bg-red-500", pulse: false },
  done: { label: "DONE", color: "bg-green-500", pulse: false },
};

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function AgentStatusBadge({
  status,
  currentTool,
  currentFile,
  retryCount,
  maxRetries,
  retryReason,
  tokenUsage,
  lastError,
}: AgentStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  // Build detail text
  let detail: string | null = null;

  if (status === "executing" && currentTool) {
    const filePart = currentFile ? ` \u2192 ${currentFile}` : "";
    detail = `${currentTool}${filePart}`;
  } else if (status === "retrying" && retryReason) {
    detail = `${retryCount}/${maxRetries} \u2014 ${retryReason}`;
  } else if (status === "done" && tokenUsage) {
    detail = `\u2191 ${formatTokens(tokenUsage.input)}  \u2193 ${formatTokens(tokenUsage.output)}  $${tokenUsage.cost_usd.toFixed(4)}`;
  } else if (status === "error" && lastError) {
    detail = lastError.message;
  }

  return (
    <div className="flex items-center gap-2 text-xs font-mono select-none">
      {/* Status dot */}
      <span className="relative flex h-2 w-2">
        {config.pulse && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
              config.color,
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex rounded-full h-2 w-2",
            config.color,
          )}
        />
      </span>

      {/* Label */}
      <span className="text-zinc-400 uppercase tracking-wider">
        {config.label}
      </span>

      {/* Detail */}
      {detail && (
        <span className="text-zinc-500 truncate max-w-[280px]">{detail}</span>
      )}
    </div>
  );
}
