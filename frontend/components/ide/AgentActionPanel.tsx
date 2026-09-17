"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RotateCcw,
  Copy,
  Clock,
  Trash2,
} from "lucide-react";
import { PhaseGroup, StepEntry } from "@/hooks/useAgentState";
import { useChatContext } from "@/contexts/ChatContext";

interface AgentActionPanelProps {
  isOpen: boolean;
  phaseGroups: PhaseGroup[];
  lastAction: StepEntry | null;
  onClearSession: () => void;
}

function relativeTime(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function StatusDot({ status }: { status: PhaseGroup["status"] }) {
  return (
    <span
      className={cn(
        "inline-block w-2 h-2 rounded-full shrink-0",
        status === "pending" && "bg-zinc-600",
        status === "active" && "bg-amber-400 animate-pulse",
        status === "done" && "bg-green-500",
        status === "error" && "bg-red-500",
      )}
    />
  );
}

function StepCard({ step }: { step: StepEntry }) {
  const { addMessage } = useChatContext();
  const [expanded, setExpanded] = useState(step.status === "error");
  const [copied, setCopied] = useState(false);

  const handleRepeat = () => {
    addMessage({ role: "user", content: `Re-run: ${step.label}` });
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Detect if summary looks like a Stellar contract address (56-char uppercase alphanumeric)
  const isContractAddress = /^[A-Z0-9]{56}$/.test(step.summary);

  return (
    <div
      className={cn(
        "rounded-md border text-xs",
        step.status === "error"
          ? "border-red-900/50 bg-red-500/5"
          : "border-zinc-800 bg-zinc-900/40",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        {step.status === "success" ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
        ) : (
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
        )}

        <span className="flex-1 text-zinc-300 font-medium truncate">{step.label}</span>

        <span className="text-zinc-600 flex items-center gap-1 shrink-0">
          <Clock className="w-3 h-3" />
          {relativeTime(step.timestamp)}
        </span>

        {step.status === "error" && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-zinc-500 hover:text-zinc-300 shrink-0"
          >
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Summary row */}
      <div className="px-3 pb-2 flex items-center gap-2">
        {isContractAddress ? (
          <code className="font-mono text-[#4ee06a]/90 truncate flex-1">
            {step.summary.slice(0, 10)}...{step.summary.slice(-8)}
          </code>
        ) : (
          <span className="text-zinc-500 truncate flex-1">{step.summary}</span>
        )}

        {isContractAddress && (
          <button
            onClick={() => handleCopy(step.summary)}
            className="p-1 hover:bg-zinc-800 rounded transition-colors shrink-0"
            title="Copy contract address"
          >
            <Copy className={cn("w-3 h-3", copied ? "text-green-400" : "text-zinc-500")} />
          </button>
        )}

        <button
          onClick={handleRepeat}
          className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
          title="Re-run this step via chat"
        >
          <RotateCcw className="w-3 h-3" />
          Repeat
        </button>
      </div>

      {/* Expanded error details */}
      {step.status === "error" && expanded && step.errorMessage && (
        <div className="px-3 pb-2 pt-1 border-t border-red-900/30">
          <p className="text-red-400/80 font-mono text-[11px] leading-relaxed break-all">
            {step.errorMessage}
          </p>
          <button
            onClick={handleRepeat}
            className="mt-2 flex items-center gap-1 px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-900/50 transition-colors text-[11px]"
          >
            <RotateCcw className="w-3 h-3" />
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

function PhaseSection({ group }: { group: PhaseGroup }) {
  const [isOpen, setIsOpen] = useState(
    group.status === "active" || group.status === "error",
  );

  const isDimmed = group.status === "pending";

  return (
    <div className={cn("space-y-1.5", isDimmed && "opacity-40")}>
      <button
        onClick={() => !isDimmed && setIsOpen(o => !o)}
        disabled={isDimmed}
        className="w-full flex items-center gap-2 px-1 py-1 rounded hover:bg-zinc-800/50 transition-colors text-left"
      >
        <StatusDot status={group.status} />
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex-1">
          {group.label}
        </span>
        {group.steps.length > 0 && (
          <span className="text-[10px] text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded-full">
            {group.steps.length}
          </span>
        )}
        {group.status === "active" && (
          <Loader2 className="w-3 h-3 text-amber-400 animate-spin shrink-0" />
        )}
        {!isDimmed && group.steps.length > 0 && (
          isOpen
            ? <ChevronDown className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
            : <ChevronRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
        )}
      </button>

      {isOpen && group.steps.length > 0 && (
        <div className="space-y-1.5 pl-4">
          {group.steps.map(step => (
            <StepCard key={step.id} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}

export function AgentActionPanel({
  isOpen,
  phaseGroups,
  lastAction,
  onClearSession,
}: AgentActionPanelProps) {
  if (!isOpen) return null;

  const allDone = phaseGroups.every(g => g.status === "done" || g.status === "pending");
  const hasAnyActivity = phaseGroups.some(g => g.steps.length > 0);

  return (
    <div className="w-72 border-l border-zinc-800 bg-zinc-900/30 flex flex-col shrink-0 overflow-hidden">
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-zinc-800/50 shrink-0 bg-white/[0.02]">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.15em]">Agent Activity</span>
        {hasAnyActivity && (
          <button
            onClick={onClearSession}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-600 hover:text-zinc-400 transition-colors"
            title="Clear session"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Last action strip (shown when all done and there is a last action) */}
      {allDone && lastAction && (
        <div className="mx-3 mt-3 p-2.5 rounded-md bg-green-500/5 border border-green-900/40 flex items-center gap-2 text-xs shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
          <span className="text-zinc-400 truncate flex-1">Last: {lastAction.label}</span>
          <span className="text-zinc-600 shrink-0">{relativeTime(lastAction.timestamp)}</span>
        </div>
      )}

      {/* Idle empty state */}
      {!hasAnyActivity && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4 gap-2">
          <div className="w-10 h-10 rounded-xl bg-zinc-800/60 border border-zinc-700/50 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-zinc-600" />
          </div>
          <p className="text-xs text-zinc-600">Waiting for agent activity...</p>
        </div>
      )}

      {/* Phase sections */}
      {hasAnyActivity && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {phaseGroups.map(group => (
            <PhaseSection key={group.phase} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
