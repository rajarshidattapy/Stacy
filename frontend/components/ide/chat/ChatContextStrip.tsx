"use client";

import { cn } from "@/lib/utils";
import { ChatContext } from "@/types/ide";
import { FileCode, Pin } from "lucide-react";

interface ChatContextStripProps {
  chatContext: ChatContext;
}

export function ChatContextStrip({ chatContext }: ChatContextStripProps) {
  return (
    <div className="border-t border-white/[0.03] bg-transparent px-4 py-2.5">
      <div className="flex flex-wrap gap-2 items-center">


        {chatContext.activeFilePath && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium bg-white/[0.05] text-zinc-300 border border-white/[0.05] shadow-sm max-w-[180px] truncate">
            <FileCode className="w-3 h-3 text-zinc-500" />
            <span className="opacity-80">Context:</span>
            <span className="font-semibold text-zinc-100">{chatContext.activeFilePath.split("/").pop()}</span>
          </div>
        )}

        {chatContext.selection && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-sm">
            <Pin className="w-2.5 h-2.5 opacity-70" />
            Lines {chatContext.selection.startLine}-{chatContext.selection.endLine}
          </div>
        )}

        {chatContext.intent && chatContext.intent !== "general" && chatContext.intent !== "contract" && (
          <div
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border capitalize",
              chatContext.intent === "explain" && "bg-blue-500/10 text-blue-400 border-blue-500/30",
              chatContext.intent === "debug" && "bg-orange-500/10 text-orange-400 border-orange-500/30",
            )}
          >
            {chatContext.intent}
          </div>
        )}
      </div>

      {chatContext.selection?.selectedText && (
        <div className="mt-2 p-2 bg-zinc-900 rounded-md border border-zinc-800 max-h-[80px] overflow-hidden">
          <pre className="text-[11px] text-zinc-400 font-mono whitespace-pre-wrap overflow-hidden">
            {chatContext.selection.selectedText.slice(0, 200)}
            {chatContext.selection.selectedText.length > 200 && "..."}
          </pre>
        </div>
      )}
    </div>
  );
}

