// ChatTransport that runs the chat panel's messages through the agent server
// instead of an LLM route. Agent events become AI SDK UI message chunks, so
// assistant-ui renders text and tool calls as usual, and every event is
// also handed to `onEvent` for the IDE's agent panel and file sync.
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import {
  agentServer,
  streamRun,
  SANDBOXLESS_AGENTS,
  type AgentEvent,
  type AgentName,
} from "./client";

export interface AgentChatContext {
  agent: AgentName;
  sandboxId: string | null;
  onEvent: (event: AgentEvent) => void;
}

function messageText(message: UIMessage | undefined): string {
  if (!message) return "";
  return message.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();
}

// Tool results can be LangChain ToolMessage objects; keep what the UI can show.
function toolOutput(result: unknown): unknown {
  if (result && typeof result === "object" && "content" in result) {
    return (result as { content: unknown }).content;
  }
  try {
    return JSON.parse(JSON.stringify(result ?? null));
  } catch {
    return String(result);
  }
}

export class AgentChatTransport implements ChatTransport<UIMessage> {
  // Backend thread per (chat, agent, sandbox) so each agent keeps its memory.
  private threads = new Map<string, string>();

  constructor(private getContext: () => AgentChatContext) {}

  private async threadFor(chatId: string, agent: AgentName, sandboxId: string | null) {
    const key = `${chatId}|${agent}|${sandboxId ?? ""}`;
    let id = this.threads.get(key);
    if (!id) {
      id = (await agentServer.createThread(agent, sandboxId)).id;
      this.threads.set(key, id);
    }
    return id;
  }

  async sendMessages({
    chatId,
    messages,
    abortSignal,
  }: Parameters<ChatTransport<UIMessage>["sendMessages"]>[0]): Promise<ReadableStream<UIMessageChunk>> {
    const { agent, sandboxId, onEvent } = this.getContext();
    const message = messageText([...messages].reverse().find((m) => m.role === "user"));

    return new ReadableStream<UIMessageChunk>({
      start: async (controller) => {
        let textId: string | null = null;
        let textCount = 0;

        const openText = () => {
          if (textId) return textId;
          textId = `text-${textCount++}`;
          controller.enqueue({ type: "text-start", id: textId });
          return textId;
        };
        const closeText = () => {
          if (!textId) return;
          controller.enqueue({ type: "text-end", id: textId });
          textId = null;
        };
        const say = (text: string) => {
          controller.enqueue({ type: "text-delta", id: openText(), delta: text });
        };

        controller.enqueue({ type: "start" });
        try {
          if (!message) {
            say("Type a message for the agent.");
          } else if (!sandboxId && !SANDBOXLESS_AGENTS.has(agent)) {
            say(
              `The **${agent}** agent works inside a sandbox. Start one from the action panel, ` +
                `or switch to the **planner** agent to shape your PRD first.`,
            );
          } else {
            const threadId = await this.threadFor(chatId, agent, sandboxId);
            let calls = 0;
            for await (const event of streamRun({ threadId, agent, sandboxId, message }, abortSignal)) {
              onEvent(event);
              switch (event.type) {
                case "thinking_chunk":
                  say(event.text);
                  break;
                case "tool_call_started":
                  if (event.planned) break;
                  closeText();
                  controller.enqueue({
                    type: "tool-input-available",
                    toolCallId: event.callId ?? `call-${calls++}`,
                    toolName: event.tool,
                    input: event.args ?? {},
                    dynamic: true,
                  });
                  break;
                case "tool_call_ended":
                  if (!event.callId) break;
                  controller.enqueue(
                    event.ok
                      ? {
                          type: "tool-output-available",
                          toolCallId: event.callId,
                          output: toolOutput(event.result),
                          dynamic: true,
                        }
                      : {
                          type: "tool-output-error",
                          toolCallId: event.callId,
                          errorText: String(toolOutput(event.result)),
                          dynamic: true,
                        },
                  );
                  break;
                case "error":
                  if (abortSignal?.aborted) break;
                  closeText();
                  say(`\n\n> **Agent error** (${event.where}): ${event.message}\n`);
                  break;
              }
            }
          }
        } catch (e) {
          if (!abortSignal?.aborted) {
            say(`\n\n> ${e instanceof Error ? e.message : String(e)}\n`);
          }
        }
        closeText();
        controller.enqueue({ type: "finish" });
        controller.close();
      },
    });
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }
}
