// Model profile catalog. Two lanes, mutually exclusive:
//
//   1. Sampling lane → custom temperature, no extended thinking.
//      Anthropic's API rejects `temperature` (and `top_p`/`top_k`) when
//      thinking is enabled, so a profile commits to one or the other.
//   2. Thinking lane → extended thinking with a budget, sampling defaults.
//
// The mode is encoded in the type so the model builder can't accidentally
// produce an illegal combination.

export type ProfileMode =
  | { type: "sampling"; temperature: number }
  | { type: "thinking"; budgetTokens: number };

export interface OpenAIProfile {
  model: string;
  // Used for thinking-mode profiles, which run on a reasoning model.
  reasoningEffort?: "low" | "medium" | "high";
}

export interface ModelProfile {
  name: string;
  model: string;         // Anthropic model
  openai: OpenAIProfile; // equivalent when MODEL_PROVIDER resolves to openai
  mode: ProfileMode;
  maxTokens: number;     // must exceed budgetTokens for thinking profiles
}

export const PROFILES = {
  // ── Sampling lane (no thinking) ─────────────────────────────────────────
  cheap: {
    name: "cheap",
    model: "claude-haiku-4-5-20251001",
    openai: { model: "gpt-4.1-mini" },
    mode: { type: "sampling", temperature: 0.0 },
    maxTokens: 4096,
  },
  chat: {
    name: "chat",
    model: "claude-sonnet-4-6",
    openai: { model: "gpt-4.1" },
    mode: { type: "sampling", temperature: 0.4 },
    maxTokens: 4096,
  },
  creative: {
    name: "creative",
    model: "claude-sonnet-4-6",
    openai: { model: "gpt-4.1" },
    mode: { type: "sampling", temperature: 0.7 },
    maxTokens: 8192,
  },
  // ── Thinking lane (no temperature) ──────────────────────────────────────
  "standard-think": {
    name: "standard-think",
    model: "claude-sonnet-4-6",
    openai: { model: "gpt-5", reasoningEffort: "medium" },
    mode: { type: "thinking", budgetTokens: 4096 },
    maxTokens: 12288,
  },
  "deep-think": {
    name: "deep-think",
    model: "claude-opus-4-7",
    openai: { model: "gpt-5", reasoningEffort: "high" },
    mode: { type: "thinking", budgetTokens: 8192 },
    maxTokens: 24576,
  },
} as const satisfies Record<string, ModelProfile>;

export type ProfileName = keyof typeof PROFILES;

export function getProfile(name: string): ModelProfile {
  const p = (PROFILES as Record<string, ModelProfile>)[name];
  if (!p) throw new Error(`unknown model profile: ${name}`);
  return p;
}

// Default profile per agent (PRD §10.2).
export const AGENT_DEFAULT_PROFILE: Record<string, ProfileName> = {
  planner: "chat",
  orchestrator: "standard-think",
  "smart-contract": "standard-think",
  frontend: "creative",
  integration: "standard-think",
  audit: "deep-think",
};

// Cost-bound downgrade chain (PRD §10.5). When the run's token budget is
// 80% consumed, profiles drop one tier in this chain. Cross-lane downgrades
// are intentional: when running tight on budget, dropping reasoning for
// sampling is the right tradeoff.
export const PROFILE_DOWNGRADE: Record<ProfileName, ProfileName | null> = {
  "deep-think": "standard-think",
  "standard-think": "cheap",
  creative: "chat",
  chat: "cheap",
  cheap: null,
};
