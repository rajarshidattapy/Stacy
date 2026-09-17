import { createDeepAgent } from "deepagents";
import { buildAllPlannerTools } from "./tools.ts";
import { buildModel } from "../../models/anthropicClient.ts";
import { selectProfile } from "../../models/selectProfile.ts";
import { composePrompt } from "../../prompts/composer.ts";
import { getCheckpointer } from "../../memory/checkpointer.ts";

export interface CreatePlannerAgentArgs {
  threadId: string;
  parentRunId: string;
  initialUserMessage?: string;
  profileOverride?: string;
}

export async function createPlannerAgent(args: CreatePlannerAgentArgs) {
  const profileName =
    args.profileOverride ??
    selectProfile({
      agent: "planner",
      lastUserMessage: args.initialUserMessage,
    });

  const systemPrompt = await composePrompt({
    base: "planner",
    fragments: [],
    agentsMd: undefined,
  });

  const tools = buildAllPlannerTools();
  const model = buildModel(profileName);
  const checkpointer = await getCheckpointer();

  const agent = createDeepAgent({
    model,
    tools,
    systemPrompt,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    checkpointer: checkpointer as any,
  });

  return { agent, profileName };
}
