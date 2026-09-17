"use client";
import { cn } from "@/lib/utils";
import { Bug, MessageSquare, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export type AIAction = "debug" | "explain";

interface CodeSelectionPopupProps {
  isVisible: boolean;
  position: { x: number; y: number };
  onAction: (action: AIAction) => void;
  onClose: () => void;
}

const actions: { id: AIAction; label: string; icon: React.ReactNode; color: string }[] = [
  { id: "debug", label: "Debug", icon: <Bug className="w-3.5 h-3.5" />, color: "text-orange-400" },
  { id: "explain", label: "Explain", icon: <MessageSquare className="w-3.5 h-3.5" />, color: "text-blue-400" },
];

export function CodeSelectionPopup({ isVisible, position, onAction, onClose }: CodeSelectionPopupProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 5 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 5 }}
          transition={{ duration: 0.15 }}
          className="fixed z-[100] bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-1 flex items-center gap-0.5"
          style={{ left: position.x, top: position.y }}
        >
          {actions.map((action) => (
            <button
              key={action.id}
              onClick={() => onAction(action.id)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                "hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100",
                action.color
              )}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
          <div className="w-px h-5 bg-zinc-700 mx-0.5" />
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
