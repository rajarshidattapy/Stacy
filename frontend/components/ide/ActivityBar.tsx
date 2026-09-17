"use client";
import { cn } from "@/lib/utils";
import { Files, Search, LayoutGrid } from "lucide-react";

export type SidebarPanel = "explorer" | "search" | "extensions" | null;

interface ActivityBarProps {
  activePanel: SidebarPanel;
  onPanelSelect: (panel: SidebarPanel) => void;
}

export function ActivityBar({ activePanel, onPanelSelect }: ActivityBarProps) {
  const togglePanel = (panel: SidebarPanel) => {
    onPanelSelect(activePanel === panel ? null : panel);
  };

  return (
    <div className="h-11 bg-zinc-950 flex items-center px-2 border-b border-zinc-800/50 shrink-0">
      <div className="flex items-center gap-1 h-full">
        <button
          onClick={() => togglePanel("explorer")}
          className={cn(
            "h-full px-2.5 flex items-center justify-center relative transition-colors",
            activePanel === "explorer" ? "text-zinc-200" : "text-zinc-500 hover:text-zinc-400"
          )}
          title="Explorer"
        >
          <Files className="w-[18px] h-[18px]" strokeWidth={1.5} />
          {activePanel === "explorer" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-200 rounded-t" />
          )}
        </button>

        <button
          onClick={() => togglePanel("search")}
          className={cn(
            "h-full px-2.5 flex items-center justify-center relative transition-colors",
            activePanel === "search" ? "text-zinc-200" : "text-zinc-500 hover:text-zinc-400"
          )}
          title="Search"
        >
          <Search className="w-[18px] h-[18px]" strokeWidth={1.5} />
          {activePanel === "search" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-200 rounded-t" />
          )}
        </button>

        <button
          onClick={() => togglePanel("extensions")}
          className={cn(
            "h-full px-2.5 flex items-center justify-center relative transition-colors",
            activePanel === "extensions" ? "text-zinc-200" : "text-zinc-500 hover:text-zinc-400"
          )}
          title="Extensions"
        >
          <LayoutGrid className="w-[18px] h-[18px]" strokeWidth={1.5} />
          {activePanel === "extensions" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-200 rounded-t" />
          )}
        </button>
      </div>
    </div>
  );
}
