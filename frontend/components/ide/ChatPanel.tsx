"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
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
import { DefaultChatTransport } from "ai";

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
  chatContext,
  onDisconnectWallet,
  walletAddress,
  walletStatus,
}: ChatPanelProps) {
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




            <div className="flex-1 overflow-hidden">
              <Thread />
            </div>
          </div>
      </div>
    </>
  );
}

export function ChatPanel(props: ChatPanelProps) {
  const runtime = useChatRuntime({ transport: new DefaultChatTransport({ api: "/api/chat" }) });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatPanelInner {...props} />
    </AssistantRuntimeProvider>
  );
}
