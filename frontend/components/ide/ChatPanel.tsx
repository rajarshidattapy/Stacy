"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import AccountsDialog from "../layout/AccountsDialog";
import { ChatContext, ChatTargetMode, FileNode } from "@/types/ide";
import { useSandboxContext } from "@/contexts/SandboxContext";
import { PricingModal } from "./PricingModal";
import { AgentStatusBadge } from "./AgentStatusBadge";
import { ChatContextStrip } from "./chat/ChatContextStrip";
import { EditorChange } from "./chat/chat-types";
import { Thread } from "@/components/assistant-ui/thread-ide";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { AgentChatTransport } from "@/lib/agent/chatTransport";
import type { AgentName } from "@/lib/agent/client";
import { cn } from "@/lib/utils";

interface ChatPanelProps {
  chatContext: ChatContext;
  onTargetModeChange: (mode: ChatTargetMode) => void;
  onSendMessage?: (message: string) => void;
  fileTree?: FileNode[];
  fileContents?: Record<string, string>;
  onApplyEditorChanges?: (changes: EditorChange[]) => void;
  onDisconnectWallet?: () => void;
  walletAddress?: string | null;
  walletStatus?: "disconnected" | "connecting" | "connected" | "error";
}

function ChatPanelInner({
  agentBar,
  chatContext,
  onDisconnectWallet,
  walletAddress,
  walletStatus,
}: ChatPanelProps & { agentBar: ReactNode }) {
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [chatWidth, setChatWidth] = useState(470);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const sandbox = useSandboxContext();
  const isResizing = useRef(false);
  const chatPanelRef = useRef<HTMLDivElement>(null);

  const isFrontendMode = chatContext.resolvedMode === "frontend";

  const handleResizeMouseDown = useCallback((event: ReactMouseEvent) => {
    event.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizing.current || !chatPanelRef.current) return;
      const panelRect = chatPanelRef.current.getBoundingClientRect();
      const nextWidth = event.clientX - panelRect.left;
      setChatWidth(Math.max(280, Math.min(600, nextWidth)));
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

  return (
    <>
      <AccountsDialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onDisconnectWallet={onDisconnectWallet}
        walletAddress={walletAddress}
        walletStatus={walletStatus}
      />

      <PricingModal
        isOpen={showPricingModal}
        onClose={() => setShowPricingModal(false)}
      />

      <div className="flex h-full">
        <div
            ref={chatPanelRef}
            className="relative flex flex-col h-full bg-[#050505] border-r border-black/[0.12] overflow-hidden shrink-0"
            style={{ width: chatWidth }}
          >
            <div
              onMouseDown={handleResizeMouseDown}
              className="absolute top-0 bottom-0 right-0 w-2 cursor-col-resize z-50 group hover:bg-[#4ee06a]/30 active:bg-[#4ee06a]/50 transition-colors"
            >
              <div className="absolute top-1/2 -translate-y-1/2 right-0.5 w-0.5 h-8 bg-zinc-700 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>




            {agentBar}
            <div className="flex-1 overflow-hidden">
              <Thread />
            </div>
          </div>
      </div>
    </>
  );
}

const AGENT_OPTIONS: { value: AgentChoice; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "planner", label: "Planner" },
  { value: "orchestrator", label: "Orchestrator" },
  { value: "smart-contract", label: "Smart contract" },
  { value: "frontend", label: "Frontend" },
  { value: "integration", label: "Integration" },
  { value: "audit", label: "Audit" },
];

type AgentChoice = "auto" | AgentName;

/** Auto: plan first without a sandbox, then follow the IDE's contract/frontend mode. */
function resolveAgent(choice: AgentChoice, sandboxId: string | null, mode: string): AgentName {
  if (choice !== "auto") return choice;
  if (!sandboxId) return "planner";
  return mode === "frontend" ? "frontend" : "smart-contract";
}

function AgentBar({
  choice,
  onChoiceChange,
  resolved,
}: {
  choice: AgentChoice;
  onChoiceChange: (choice: AgentChoice) => void;
  resolved: AgentName;
}) {
  const sandbox = useSandboxContext();
  const { agentState } = sandbox;
  const busy = agentState.isLoading || agentState.status === "executing" || agentState.status === "thinking";

  return (
    <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-2 text-[11px]">
      <label className="flex items-center gap-2 text-zinc-500">
        Agent
        <select
          value={choice}
          onChange={(e) => onChoiceChange(e.target.value as AgentChoice)}
          className="rounded-md border border-white/[0.08] bg-zinc-900 px-2 py-1 text-zinc-200 outline-none focus-visible:ring-1 focus-visible:ring-zinc-600"
        >
          {AGENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.value === "auto" ? `Auto (${resolved})` : o.label}
            </option>
          ))}
        </select>
      </label>
      <span className="flex items-center gap-1.5 text-zinc-500">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            busy ? "bg-amber-400 animate-pulse" : sandbox.isConnected ? "bg-[#4ee06a]" : "bg-zinc-600",
          )}
        />
        {busy
          ? agentState.currentTool ?? "working"
          : sandbox.isConnected
            ? `sandbox ${sandbox.sandboxInfo?.sessionId.slice(0, 8) ?? ""}`
            : "no sandbox"}
      </span>
    </div>
  );
}

export function ChatPanel(props: ChatPanelProps) {
  const sandbox = useSandboxContext();
  const [agentChoice, setAgentChoice] = useState<AgentChoice>("auto");
  const sandboxId = sandbox.sandboxInfo?.sessionId ?? null;
  const resolvedAgent = resolveAgent(agentChoice, sandboxId, props.chatContext.resolvedMode);

  // The transport lives for the panel's lifetime and reads the latest
  // selection through this ref at send time.
  const contextRef = useRef({ agent: resolvedAgent, sandboxId, onEvent: sandbox.handleAgentEvent });
  contextRef.current = { agent: resolvedAgent, sandboxId, onEvent: sandbox.handleAgentEvent };
  const transport = useMemo(() => new AgentChatTransport(() => contextRef.current), []);
  const runtime = useChatRuntime({ transport });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatPanelInner
        {...props}
        agentBar={
          <AgentBar choice={agentChoice} onChoiceChange={setAgentChoice} resolved={resolvedAgent} />
        }
      />
    </AssistantRuntimeProvider>
  );
}
