import type { AgentSignal } from "@/hooks/useAgentState";
import type { AgentEvent } from "./client";

/** Translate an agent-server event into the IDE's AgentSignal vocabulary. */
export function agentEventToSignal(ev: AgentEvent): AgentSignal | null {
  switch (ev.type) {
    case "agent_started":
      return { type: "agent.thinking", phase: "planning" };
    case "thinking_started":
      return { type: "agent.thinking", phase: "executing" };
    case "tool_call_started":
      // The planned event arrives before args are known; wait for execution.
      if (ev.planned) return null;
      return { type: "agent.tool_call", tool: ev.tool, args: ev.args ?? {}, iteration: 0 };
    case "tool_call_ended":
      return { type: "agent.tool_result", tool: ev.tool, success: ev.ok, duration_ms: ev.ms ?? 0 };
    case "error":
      return { type: "agent.error", message: ev.message, code: ev.where, recoverable: true };
    case "agent_ended":
      if (ev.status !== "success") return null; // the preceding `error` event carries the reason
      return {
        type: "agent.done",
        message: "",
        file_changes: [],
        model: "",
        tokens: { input: 0, output: ev.totalTokens ?? 0, cost_usd: 0 },
      };
    default:
      return null;
  }
}
