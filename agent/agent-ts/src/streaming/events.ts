// Canonical agent event schema. The agent runtime translates LangGraph's
// streamEvents output into these. The CLI test harness, the eventual SSE
// server, and any logging sink consume only these — never raw LangGraph
// events. This insulates the rest of the system from LangGraph internals.

export type AgentEvent =
  | { type: "agent_started"; agent: string; threadId: string; runId: string }
  | { type: "thinking_started"; profile?: string; modelName?: string }
  | { type: "thinking_chunk"; text: string }
  | { type: "thinking_ended"; tokensIn?: number; tokensOut?: number; ms?: number }
  // `planned` marks the early event from the model's tool-call stream (args not
  // yet known, callId is the model's tool_use id). The later un-planned event
  // comes from tool execution and carries full args.
  | { type: "tool_call_started"; tool: string; args: Record<string, unknown>; callId?: string; planned?: boolean }
  | { type: "tool_call_ended"; tool: string; result: unknown; ms?: number; ok: boolean; callId?: string }
  | { type: "todo_updated"; todos: unknown[] }
  | { type: "subagent_spawned"; parentRunId: string; subagentName: string; taskDescription: string; subagentRunId?: string }
  | { type: "subagent_event"; subagentRunId: string; innerEvent: AgentEvent }
  | { type: "subagent_returned"; subagentRunId: string; summary: unknown }
  | { type: "agent_message"; text: string }
  | { type: "phase_complete"; phase: string; summary: unknown }
  | { type: "awaiting_user_input"; reason: string; context?: unknown }
  | { type: "error"; where: string; message: string; stack?: string }
  | { type: "agent_ended"; status: string; finalSummary?: unknown; totalTokens?: number; ms?: number };

export type AgentEventType = AgentEvent["type"];
