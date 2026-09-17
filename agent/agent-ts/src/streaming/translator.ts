// Translates LangGraph streamEvents v2 chunks into our canonical AgentEvent.
// Returns null for events we silence.
//
// LangGraph emits events of the shape { event, name, run_id, data, metadata, tags? }
// where `event` is e.g. "on_chat_model_start", "on_chat_model_stream",
// "on_chat_model_end", "on_tool_start", "on_tool_end", "on_chain_start", etc.
import type { AgentEvent } from "./events.ts";

export interface RawLangGraphEvent {
  event: string;
  name?: string;
  run_id?: string;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

interface MessageChunk {
  content?: string | Array<Record<string, unknown>>;
  tool_calls?: Array<{ name: string; args: Record<string, unknown>; id?: string }>;
  tool_call_chunks?: Array<{ name?: string; args?: string; id?: string; index?: number }>;
  usage_metadata?: { input_tokens?: number; output_tokens?: number };
}

function extractText(chunk: MessageChunk | undefined): string {
  if (!chunk) return "";
  const content = chunk.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (b.type === "text" && typeof b.text === "string" ? b.text : ""))
      .join("");
  }
  return "";
}

export function translateLangGraphEvent(raw: RawLangGraphEvent): AgentEvent | null {
  const { event, data, metadata } = raw;

  switch (event) {
    case "on_chat_model_start": {
      const profile = (metadata?.profile as string | undefined) ?? undefined;
      const modelName = (metadata?.ls_model_name as string | undefined) ?? undefined;
      return { type: "thinking_started", profile, modelName };
    }

    case "on_chat_model_stream": {
      const chunk = data?.chunk as MessageChunk | undefined;
      const text = extractText(chunk);
      if (text) return { type: "thinking_chunk", text };

      // Tool-call planning chunks come through here too — we surface them as
      // a tool_call_started once we have a name (args may still be streaming).
      const tcChunks = chunk?.tool_call_chunks;
      if (tcChunks && tcChunks.length > 0) {
        for (const tc of tcChunks) {
          if (tc.name) {
            return {
              type: "tool_call_started",
              tool: tc.name,
              args: {},
              callId: tc.id,
              planned: true,
            };
          }
        }
      }
      return null;
    }

    case "on_chat_model_end": {
      const output = data?.output as MessageChunk | undefined;
      const usage = output?.usage_metadata;
      return {
        type: "thinking_ended",
        tokensIn: usage?.input_tokens,
        tokensOut: usage?.output_tokens,
      };
    }

    case "on_tool_start": {
      return {
        type: "tool_call_started",
        tool: raw.name ?? "unknown",
        args: (data?.input as Record<string, unknown>) ?? {},
        callId: raw.run_id,
      };
    }

    case "on_tool_end": {
      const output = data?.output;
      const ok = !(typeof output === "string" && /^\[.*error/i.test(output));
      return {
        type: "tool_call_ended",
        tool: raw.name ?? "unknown",
        result: output,
        ok,
        callId: raw.run_id,
      };
    }

    default:
      return null;
  }
}
