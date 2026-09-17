"use client";

import { cn } from "@/lib/utils";
import { Bot, Loader2, User } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { RefObject } from "react";
import { ChatMessage, MODELS } from "./chat-types";

interface ChatMessagesProps {
  messages: ChatMessage[];
  isLoading: boolean;
  endRef: RefObject<HTMLDivElement | null>;
}

export function ChatMessages({ messages, isLoading, endRef }: ChatMessagesProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
      <AnimatePresence>
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("flex gap-3", msg.role === "user" && "flex-row-reverse")}
          >
            <div
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                msg.role === "assistant" ? "bg-[#4ee06a]/10" : "bg-zinc-800",
              )}
            >
              {msg.role === "assistant" ? (
                <Bot className="w-5 h-5 text-[#4ee06a]" />
              ) : (
                <User className="w-4 h-4 text-zinc-400" />
              )}
            </div>

            <div className={cn("space-y-1 max-w-[85%]", msg.role === "user" && "items-end")}>
              <div className={cn("flex items-center gap-2", msg.role === "user" && "justify-end")}>
                <span className="text-xs font-semibold text-zinc-400">
                  {msg.role === "assistant" ? "Stella" : "You"}
                </span>
                {msg.model && <MessageModelIcon modelId={msg.model} />}
              </div>

              <div
                className={cn(
                  "text-sm leading-relaxed p-3 border prose prose-invert prose-sm max-w-none",
                  msg.role === "assistant"
                    ? "text-zinc-300 bg-zinc-900/50 rounded-r-lg rounded-bl-lg border-zinc-800/50"
                    : "text-zinc-200 bg-[#4ee06a]/20 rounded-l-lg rounded-br-lg border-[#4ee06a]/30",
                )}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code: ({ inline, children, ...props }: any) =>
                      inline ? (
                        <code
                          className="px-1.5 py-0.5 bg-zinc-800/50 text-[#4ee06a] rounded text-xs font-mono"
                          {...props}
                        >
                          {children}
                        </code>
                      ) : (
                        <code
                          className="block p-3 bg-zinc-950/50 rounded-md border border-zinc-800/50 text-xs font-mono text-zinc-300 overflow-x-auto"
                          {...props}
                        >
                          {children}
                        </code>
                      ),
                    pre: ({ children, ...props }: any) => (
                      <pre className="p-0 bg-transparent" {...props}>
                        {children}
                      </pre>
                    ),
                    p: ({ children, ...props }: any) => (
                      <p className="mb-2 last:mb-0" {...props}>
                        {children}
                      </p>
                    ),
                    ul: ({ children, ...props }: any) => (
                      <ul className="flex flex-col gap-2 my-3 w-full" {...props}>
                        {children}
                      </ul>
                    ),
                    ol: ({ children, ...props }: any) => (
                      <ol className="flex flex-col gap-2 my-3 w-full list-decimal list-inside" {...props}>
                        {children}
                      </ol>
                    ),
                    li: ({ children, ...props }: any) => (
                      <li
                        className="flex items-start gap-2 p-2.5 rounded-md bg-zinc-950/40 border border-zinc-800/60 text-zinc-300 text-[13px] leading-relaxed shadow-sm"
                        {...props}
                      >
                        <div className="flex-1 min-w-0">{children}</div>
                      </li>
                    ),
                    a: ({ children, ...props }: any) => (
                      <a className="text-[#4ee06a] hover:text-[#4ee06a] underline" {...props}>
                        {children}
                      </a>
                    ),
                    strong: ({ children, ...props }: any) => (
                      <strong className="font-semibold text-zinc-200" {...props}>
                        {children}
                      </strong>
                    ),
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {isLoading && <ThinkingMessage />}
      <div ref={endRef} />
    </div>
  );
}

function MessageModelIcon({ modelId }: { modelId: string }) {
  const model = MODELS.find((item) => item.id === modelId);

  if (!model) {
    return null;
  }

  return (
    <span className="text-[10px] text-zinc-600">
      <img
        src={model.icon}
        alt={model.name}
        className="inline-block h-4 w-4 rounded object-cover align-middle"
      />
    </span>
  );
}

function ThinkingMessage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3"
    >
      <div className="w-8 h-8 rounded-lg bg-[#4ee06a]/10 flex items-center justify-center shrink-0">
        <Bot className="w-5 h-5 text-[#4ee06a]" />
      </div>
      <div className="space-y-1">
        <div className="text-xs font-semibold text-zinc-400">Stella</div>
        <div className="text-sm text-zinc-300 bg-zinc-900/50 p-3 rounded-r-lg rounded-bl-lg border border-zinc-800/50 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-[#4ee06a]" />
          <span className="text-zinc-500">Thinking...</span>
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 bg-[#4ee06a] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 bg-[#4ee06a] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 bg-[#4ee06a] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
