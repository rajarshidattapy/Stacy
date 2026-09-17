// Integration agent factory. Mirrors createSmartContractAgent /
// createFrontendAgent — same ordering of profile selection → fragment
// selection → AGENTS.md read → composePrompt → build tools (incl. delegate)
// → buildModel → checkpointer → createDeepAgent.
//
// Scope (per amendment in agent-ts/changes.md): full R/W on both
// /workspace/contracts/ and /workspace/frontend/. Integration genuinely needs
// to write into contracts/.deployments/ for ABI/address caches; preventing
// contract writes blocks legitimate work. Audit retains its strict read-only
// stance on contracts.
import { createDeepAgent } from "deepagents";
import { buildAllIntegrationTools } from "./tools.ts";
import { INTEGRATION_SUBAGENTS } from "./subagents/index.ts";
import { buildDelegateTool } from "../_runtime/delegateTool.ts";
import { buildSkillsBackend, READ_ONLY_SKILLS_PERMISSIONS } from "../_runtime/skillsBackend.ts";
import { buildModel } from "../../models/anthropicClient.ts";
import { selectProfile } from "../../models/selectProfile.ts";
import { composePrompt } from "../../prompts/composer.ts";
import { selectFragments } from "../../prompts/selector.ts";
import { getCheckpointer } from "../../memory/checkpointer.ts";
import { readFile as readSandboxFile } from "../../tools/filesystem.ts";
import { listBroadcasts } from "../../tools/integration.ts";

export interface CreateIntegrationAgentArgs {
  sandboxId: string;
  threadId: string;
  parentRunId: string;
  initialUserMessage?: string;
  profileOverride?: string;
}

async function tryReadAgentsMd(sandboxId: string): Promise<string | undefined> {
  // Integration sees both project + frontend + contract conventions.
  const project = await readSandboxFile(sandboxId, { path: "/workspace/AGENTS.md" });
  const frontend = await readSandboxFile(sandboxId, { path: "/workspace/frontend/AGENTS.md" });
  const contracts = await readSandboxFile(sandboxId, { path: "/workspace/contracts/AGENTS.md" });
  const parts: string[] = [];
  if (project.ok) parts.push(`# /workspace/AGENTS.md\n\n${project.data.content.trim()}`);
  if (frontend.ok) parts.push(`# /workspace/frontend/AGENTS.md\n\n${frontend.data.content.trim()}`);
  if (contracts.ok) parts.push(`# /workspace/contracts/AGENTS.md\n\n${contracts.data.content.trim()}`);
  return parts.length ? parts.join("\n\n") : undefined;
}

// Probe broadcast/ to decide whether the no-deployments fragment should fire.
async function hasDeployments(sandboxId: string): Promise<boolean> {
  const r = await listBroadcasts(sandboxId);
  if (!r.ok) return false;
  return (r.data.runs?.length ?? 0) > 0;
}

export async function createIntegrationAgent(args: CreateIntegrationAgentArgs) {
  const profileName =
    args.profileOverride ??
    selectProfile({
      agent: "integration",
      lastUserMessage: args.initialUserMessage,
    });

  const deployed = await hasDeployments(args.sandboxId);
  const fragments = selectFragments({
    agent: "integration",
    lastUserMessage: args.initialUserMessage,
    noDeployments: !deployed,
  });

  const agentsMd = await tryReadAgentsMd(args.sandboxId);

  const systemPrompt = await composePrompt({
    base: "integration",
    fragments,
    agentsMd,
    sandboxId: args.sandboxId,
  });

  const tools = [
    ...buildAllIntegrationTools(args.sandboxId),
    buildDelegateTool({
      parentRunId: args.parentRunId,
      sandboxId: args.sandboxId,
      threadId: args.threadId,
      registry: INTEGRATION_SUBAGENTS,
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
