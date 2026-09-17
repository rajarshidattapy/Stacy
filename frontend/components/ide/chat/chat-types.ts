import type { ChatTargetMode } from "@/types/ide";

export type AIModel =
  | "gemini-2.5-flash"
  | "gemini-2.5-pro"
  | "gpt-4o-mini"
  | "claude-sonnet"
  | "deepseek:deepseek-chat"
  | "groq:moonshotai/kimi-k2-instruct-0905"
  | `openrouter:${string}`;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  model?: AIModel;
}

export interface EditorChange {
  path: string;
  action: "create" | "update" | "delete";
  content: string;
}

export interface ChatModelOption {
  id: AIModel;
  name: string;
  icon: string;
}

export const MODELS: ChatModelOption[] = [
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", icon: "/gemini.webp" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", icon: "/gemini.webp" },
  { id: "deepseek:deepseek-chat", name: "DeepSeek", icon: "/deepseek.webp" },
  { id: "groq:moonshotai/kimi-k2-instruct-0905", name: "Kimi K2", icon: "/kimi.png" },
  { id: "gpt-4o-mini", name: "GPT-4o-mini", icon: "/openai.jpg" },
  { id: "openrouter:z-ai/glm-4.5-air:free", name: "GLM 4.5", icon: "/glm.png" },
];

export const FRONTEND_MODELS: ChatModelOption[] = [
  { id: "groq:moonshotai/kimi-k2-instruct-0905", name: "Kimi K2", icon: "/kimi.png" },
  { id: "gpt-4o-mini", name: "GPT-4o-mini", icon: "/openai.jpg" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", icon: "/gemini.webp" },
  { id: "claude-sonnet", name: "Claude Sonnet 4", icon: "/claude.webp" },
];

export const CHAT_TARGET_MODES: ChatTargetMode[] = ["auto", "contract", "frontend"];

