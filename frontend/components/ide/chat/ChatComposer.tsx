"use client";

import { cn } from "@/lib/utils";
import { ChatContext, ChatTargetMode } from "@/types/ide";
import { ChevronDown, Loader2, Mic, MicOff, Paperclip, SendHorizontal, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { FormEvent, RefObject } from "react";
import {
  AIModel,
  CHAT_TARGET_MODES,
  FRONTEND_MODELS,
  MODELS,
} from "./chat-types";

interface ChatComposerProps {
  chatContext: ChatContext;
  selectedModel: AIModel;
  onSelectedModelChange: (model: AIModel) => void;
  isModelDropdownOpen: boolean;
  onModelDropdownOpenChange: (isOpen: boolean) => void;
  input: string;
  onInputChange: (value: string) => void;
  isLoading: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onSend: (event?: FormEvent) => void;
  onTargetModeChange: (mode: ChatTargetMode) => void;
  isSpeechSupported: boolean;
  isListening: boolean;
  onToggleListening: () => void;
}

export function ChatComposer({
  chatContext,
  selectedModel,
  onSelectedModelChange,
  isModelDropdownOpen,
  onModelDropdownOpenChange,
  input,
  onInputChange,
  isLoading,
  textareaRef,
  onSend,
  onTargetModeChange,
  isSpeechSupported,
  isListening,
  onToggleListening,
}: ChatComposerProps) {
  const activeModel = MODELS.find((model) => model.id === selectedModel);
  const availableModels = chatContext.resolvedMode === "frontend" ? FRONTEND_MODELS : MODELS;

  return (
    <div className="p-3 bg-zinc-900/30">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => onModelDropdownOpenChange(!isModelDropdownOpen)}
              className="flex items-center gap-2 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors"
            >
              {activeModel && <ModelIcon icon={activeModel.icon} name={activeModel.name} />}
              <span>{activeModel?.name}</span>
              <ChevronDown className={cn("w-3 h-3 transition-transform", isModelDropdownOpen && "rotate-180")} />
            </button>
            <AnimatePresence>
              {isModelDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="absolute bottom-full left-0 mb-1 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl overflow-hidden z-50"
                >
                  {availableModels.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => {
                        onSelectedModelChange(model.id);
                        onModelDropdownOpenChange(false);
                      }}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 text-xs w-full text-left hover:bg-zinc-800 transition-colors",
                        selectedModel === model.id ? "text-[#4ee06a]" : "text-zinc-400",
                      )}
                    >
                      <ModelIcon icon={model.icon} name={model.name} />
                      <span>{model.name}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <TargetSwitcher
            targetMode={chatContext.targetMode}
            onTargetModeChange={onTargetModeChange}
          />
        </div>

        <div className="text-[10px] text-zinc-600 flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
        </div>
      </div>

      <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl focus-within:ring-1 focus-within:ring-[#4ee06a]/50 focus-within:border-[#4ee06a]/50 transition-all shadow-sm">
        <form onSubmit={onSend}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => {
              onInputChange(event.target.value);
              if (textareaRef.current) {
                textareaRef.current.style.height = "auto";
                textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSend(event);
              }
            }}
            disabled={isLoading}
            rows={1}
            placeholder={`Ask about ${chatContext.resolvedMode}...`}
            className="w-full bg-transparent text-sm text-zinc-200 p-3 pr-20 resize-none outline-none max-h-[200px] min-h-[44px] disabled:opacity-50"
          />
        </form>

        <div className="absolute bottom-2 right-2 flex items-center gap-1">
          <button className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors">
            <Paperclip className="w-4 h-4" />
          </button>
          {isSpeechSupported && (
            <button
              type="button"
              onClick={onToggleListening}
              disabled={isLoading}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                isListening
                  ? "bg-red-600 text-white hover:bg-red-500 animate-pulse"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
              title={isListening ? "Stop recording" : "Start voice input"}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={onSend}
            disabled={!input.trim() || isLoading}
            className="p-1.5 bg-[#4ee06a] text-white rounded-md disabled:opacity-50 hover:bg-[#4ee06a] transition-colors"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizontal className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModelIcon({ icon, name }: { icon: string; name: string }) {
  return (
    <img
      src={icon}
      alt={name}
      className="inline-block h-[18px] w-[18px] rounded object-cover align-middle"
    />
  );
}

function TargetSwitcher({
  targetMode,
  onTargetModeChange,
}: {
  targetMode: ChatTargetMode;
  onTargetModeChange: (mode: ChatTargetMode) => void;
}) {
  return (
    <div
      className="relative inline-flex gap-3 p-0.4 rounded-full shadow-md"
      style={{ background: "linear-gradient(to bottom, #27272a, #18181b)" }}
    >
      <motion.div
        className="absolute top-0.5 rounded-full"
        initial={false}
        animate={{
          left: `calc(${(CHAT_TARGET_MODES.indexOf(targetMode) / 3) * 100}% + 2px)`,
          width: `calc(${100 / 2.5}% - 4px)`,
        }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        style={{
          height: "calc(100% - 4px)",
          background: "linear-gradient(135deg, #E6E6E6 0%, #BDBDBD 22%, #6D28D9 55%, #3B0764 100%)",
          boxShadow: "0 1px 4px rgba(109, 40, 217, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.25)",
        }}
      />
      {CHAT_TARGET_MODES.map((mode) => (
        <button
          key={mode}
          onClick={() => onTargetModeChange(mode)}
          className="relative z-10 px-2.5 py-1 text-[12px] rounded-full uppercase font-semibold transition-all duration-200 cursor-pointer"
          style={{ color: targetMode === mode ? "#F4F4F5" : "#666666" }}
          title={`Target: ${mode}`}
        >
          {mode === "auto" ? "Auto" : mode.slice(0, 1)}
        </button>
      ))}
    </div>
  );
}
