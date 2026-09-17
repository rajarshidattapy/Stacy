// Rule-based intent → profile selector. No LLM call.
//
// Keeps the agent's effective profile dynamic across a single run: a long
// SC session might author a contract (standard-think), debug a stubborn
// failing test (deep-think), and run a deploy (standard-think) all in one
// thread. UI-heavy work routes into the sampling lane (creative).
import { AGENT_DEFAULT_PROFILE, type ProfileName } from "./profiles.ts";

export interface SelectProfileInput {
  agent: string;
  currentTodo?: string;
  lastUserMessage?: string;
  lastToolFailed?: boolean;
}

export function selectProfile(input: SelectProfileInput): ProfileName {
  const text = `${input.currentTodo ?? ""} ${input.lastUserMessage ?? ""}`.toLowerCase();
  const fallback = AGENT_DEFAULT_PROFILE[input.agent] ?? "standard-think";

  // Hard-debugging cues → deep reasoning.
  if (input.lastToolFailed && /(test|deploy|build).*(fail|revert|error)/.test(text)) {
    return "deep-think";
  }

  if (input.agent === "smart-contract") {
    if (/(test fail|revert|stack too deep|out of gas|invariant)/.test(text)) return "deep-think";
    return "standard-think";
  }

  if (input.agent === "frontend") {
    // UI authoring (design / copy / naming) is the sampling-lane case.
    if (/\b(design|copy|naming|hero|landing|aesthetic|component)\b/.test(text)) return "creative";
    // Build/lint fixes and other mechanical work want deliberation.
    return "standard-think";
  }

  if (input.agent === "audit") {
    // "Quick" audit pass — drop from opus to sonnet thinking.
    if (/\bquick\b/.test(text)) return "standard-think";
    return "deep-think";
  }

  if (input.agent === "integration") {
    // Integration is mostly mechanical wiring (ABI sync, addresses, hooks).
    // Sonnet thinking is plenty — only Phase 7's budget guard would downgrade.
    return "standard-think";
  }

  if (input.agent === "planner") {
    return "chat";
  }

  return fallback;
}
