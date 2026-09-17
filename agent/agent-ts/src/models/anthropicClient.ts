// Profile name → configured ChatAnthropic instance.
//
// Sampling-mode profiles get `temperature`; thinking-mode profiles get the
// extended-thinking config and *no* `temperature` (Anthropic's API forbids
// the combination). The discriminated union in profiles.ts ensures a profile
// is one or the other, never both.
//
// Instances aren't cached — temperature/maxTokens may shift over a run when
// intent-based selection picks a different profile. If profile churn becomes
// a hot path we can memoise on the profile name later.
import { ChatAnthropic } from "@langchain/anthropic";
import { getProfile } from "./profiles.ts";

export function buildModel(profileName: string): ChatAnthropic {
  const profile = getProfile(profileName);
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
