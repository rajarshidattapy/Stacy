// Profile name → configured chat model for the active provider.
//
// Provider: MODEL_PROVIDER=anthropic|openai, or unset to pick whichever API
// key is present (Anthropic first).
//
// Anthropic: sampling-mode profiles get `temperature`; thinking-mode profiles
// get the extended-thinking config and *no* `temperature` (the API forbids
// the combination). The discriminated union in profiles.ts ensures a profile
// is one or the other, never both.
//
// OpenAI: each profile names its own model; thinking-mode profiles map to a
// reasoning model with `reasoning.effort`. OPENAI_MODEL overrides the model
// for every profile.
//
// Instances aren't cached — temperature/maxTokens may shift over a run when
// intent-based selection picks a different profile. If profile churn becomes
// a hot path we can memoise on the profile name later.
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { getProfile, type ModelProfile } from "./profiles.ts";

export type ModelProvider = "anthropic" | "openai";

export function resolveProvider(): ModelProvider {
  const explicit = process.env.MODEL_PROVIDER?.trim().toLowerCase();
  if (explicit) {
    if (explicit !== "anthropic" && explicit !== "openai") {
      throw new Error(`MODEL_PROVIDER must be "anthropic" or "openai", got "${explicit}"`);
    }
    return explicit;
  }
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  throw new Error("No model API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
}

function buildAnthropicModel(profile: ModelProfile): ChatAnthropic {
  const common = {
    model: profile.model,
    maxTokens: profile.maxTokens,
    apiKey: process.env.ANTHROPIC_API_KEY,
  };
  if (profile.mode.type === "thinking") {
    // claude-opus-4-x requires thinking.type="adaptive" (no budget_tokens arg).
    // claude-sonnet-4-x still accepts "enabled" with an explicit budget.
    const useAdaptive = /claude-opus-4/.test(profile.model);
    return new ChatAnthropic({
      ...common,
      thinking: useAdaptive
        ? { type: "adaptive" as const }
        : { type: "enabled" as const, budget_tokens: profile.mode.budgetTokens },
    });
  }
  return new ChatAnthropic({
    ...common,
    temperature: profile.mode.temperature,
  });
}

function buildOpenAIModel(profile: ModelProfile): ChatOpenAI {
  const model = process.env.OPENAI_MODEL || profile.openai.model;
  const common = {
    model,
    apiKey: process.env.OPENAI_API_KEY,
    // Reasoning tokens count against this limit on reasoning models.
    maxTokens: profile.maxTokens,
    ...(process.env.OPENAI_BASE_URL ? { configuration: { baseURL: process.env.OPENAI_BASE_URL } } : {}),
  };
  // Decide by the model actually used, since OPENAI_MODEL can put a reasoning
  // model behind a sampling profile or vice versa. Reasoning models reject a
  // custom temperature; other models reject `reasoning`.
  if (isOpenAIReasoningModel(model)) {
    const effort = profile.mode.type === "thinking" ? (profile.openai.reasoningEffort ?? "medium") : "low";
    return new ChatOpenAI({ ...common, reasoning: { effort } });
  }
  return new ChatOpenAI({
    ...common,
    temperature: profile.mode.type === "sampling" ? profile.mode.temperature : undefined,
  });
}

function isOpenAIReasoningModel(model: string): boolean {
  return /^o\d/.test(model) || (model.startsWith("gpt-5") && !model.startsWith("gpt-5-chat"));
}

export function buildModel(profileName: string): BaseChatModel {
  const profile = getProfile(profileName);
  return resolveProvider() === "openai" ? buildOpenAIModel(profile) : buildAnthropicModel(profile);
}
