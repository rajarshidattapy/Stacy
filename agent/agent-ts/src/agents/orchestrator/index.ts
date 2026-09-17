import { createDeepAgent } from "deepagents";
import { buildAllOrchestratorTools } from "./tools.ts";
import { ORCHESTRATOR_SUBAGENTS } from "./subagents.ts";
import { buildDelegateTool } from "../_runtime/delegateTool.ts";
import { buildSkillsBackend, READ_ONLY_SKILLS_PERMISSIONS } from "../_runtime/skillsBackend.ts";
import { buildModel } from "../../models/client.ts";
import { selectProfile } from "../../models/selectProfile.ts";
import { composePrompt } from "../../prompts/composer.ts";
import { getCheckpointer } from "../../memory/checkpointer.ts";

export interface CreateOrchestratorAgentArgs {
  sandboxId: string;
  threadId: string;
  parentRunId: string;
  initialUserMessage?: string;
  profileOverride?: string;
  pauseBetweenPhases?: boolean;
}

export async function createOrchestratorAgent(args: CreateOrchestratorAgentArgs) {
  const profileName =
    args.profileOverride ??
    selectProfile({
      agent: "orchestrator",
      lastUserMessage: args.initialUserMessage,
    });

  let systemPrompt = await composePrompt({
    base: "orchestrator",
    fragments: [],
    sandboxId: args.sandboxId,
  });

  if (args.pauseBetweenPhases !== false) {
    systemPrompt += "\n\nPAUSE GATE ENABLED: You MUST output exactly [AWAITING_USER_INPUT] when completing a phase, before proceeding to the next one, to ask the user for approval.";
  }

  const tools = [
    ...buildAllOrchestratorTools(args.sandboxId),
    buildDelegateTool({
      parentRunId: args.parentRunId,
      sandboxId: args.sandboxId,
      threadId: args.threadId,
      registry: ORCHESTRATOR_SUBAGENTS,
    }),
  ];

  const model = buildModel(profileName);
  const checkpointer = await getCheckpointer();

  const agent = createDeepAgent({
    model,
    tools,
    systemPrompt,
    backend: buildSkillsBackend(),
    permissions: READ_ONLY_SKILLS_PERMISSIONS,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    checkpointer: checkpointer as any,
  });

  return { agent, profileName };
}
