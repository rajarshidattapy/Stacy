"use client";

import { cn } from "@/lib/utils";
import { MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface ChatIconRailProps {
  isChatOpen: boolean;
  onToggleChat: () => void;
  onOpenSettings: () => void;
}

export function ChatIconRail({
  isChatOpen,
  onToggleChat,
  onOpenSettings,
}: ChatIconRailProps) {
  return (
    <div className="w-12 h-full bg-[#050505] border-r border-white/[0.12] flex flex-col items-center py-4 gap-2 shrink-0">
      <button
        onClick={onToggleChat}
        className={cn(
          "p-2.5 rounded-xl transition-all",
          isChatOpen
            ? "bg-white/[0.08] text-[#4ee06a] shadow-sm"
            : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05]",
        )}
        title={isChatOpen ? "Hide Chat" : "Show Chat"}
      >
        <MessageSquare className="w-5 h-5" />
      </button>

      <div className="flex-1" />

      <button
        onClick={onOpenSettings}
        className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
        title="Account & Settings"
      >
        <Avatar className="w-8 h-8 border border-zinc-800">
          <AvatarFallback className="bg-zinc-800 text-zinc-400 text-xs">
            M
          </AvatarFallback>
        </Avatar>
      </button>
    </div>
  );
}

