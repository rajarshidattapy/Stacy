// Frontend agent factory. Mirrors createSmartContractAgent — same ordering of
// profile selection → fragment selection → AGENTS.md read → composePrompt →
// build tools (incl. delegate) → buildModel → checkpointer → createDeepAgent.
//
// Scope: read-write on /workspace/frontend/ only. The Integration agent owns
// /workspace/contracts/ ↔ /workspace/frontend/ wiring.
import { createDeepAgent } from "deepagents";
import { buildAllFeTools } from "./tools.ts";
import { FE_SUBAGENTS } from "./subagents/index.ts";
import { buildDelegateTool } from "../_runtime/delegateTool.ts";
import { buildSkillsBackend, READ_ONLY_SKILLS_PERMISSIONS } from "../_runtime/skillsBackend.ts";
import { buildModel } from "../../models/anthropicClient.ts";
import { selectProfile } from "../../models/selectProfile.ts";
import { composePrompt } from "../../prompts/composer.ts";
import { selectFragments } from "../../prompts/selector.ts";
import { getCheckpointer } from "../../memory/checkpointer.ts";
import { readFile as readSandboxFile, listDir as listSandboxDir } from "../../tools/filesystem.ts";

export interface CreateFrontendAgentArgs {
  sandboxId: string;
  threadId: string;
  parentRunId: string;
  initialUserMessage?: string;
  profileOverride?: string;
}

async function tryReadAgentsMd(sandboxId: string): Promise<string | undefined> {
  const project = await readSandboxFile(sandboxId, { path: "/workspace/AGENTS.md" });
  const frontend = await readSandboxFile(sandboxId, { path: "/workspace/frontend/AGENTS.md" });
  const parts: string[] = [];
  if (project.ok) parts.push(`# /workspace/AGENTS.md\n\n${project.data.content.trim()}`);
  if (frontend.ok) parts.push(`# /workspace/frontend/AGENTS.md\n\n${frontend.data.content.trim()}`);
  return parts.length ? parts.join("\n\n") : undefined;
}

// Heuristic: do we have a populated node_modules? If not, the selector emits
// the `frontend-fresh-start` fragment that nudges the agent to install first.
async function isFreshFrontend(sandboxId: string): Promise<boolean> {
  const ls = await listSandboxDir(sandboxId, { path: "/workspace/frontend/node_modules" });
  if (!ls.ok) return true;
  return (ls.data.entries?.length ?? 0) === 0;
}

export async function createFrontendAgent(args: CreateFrontendAgentArgs) {
  const profileName =
    args.profileOverride ??
    selectProfile({
      agent: "frontend",
      lastUserMessage: args.initialUserMessage,
    });

  const fresh = await isFreshFrontend(args.sandboxId);
  const fragments = selectFragments({
    agent: "frontend",
    lastUserMessage: args.initialUserMessage,
    freshFrontend: fresh,
  });

  const agentsMd = await tryReadAgentsMd(args.sandboxId);

  const systemPrompt = await composePrompt({
    base: "frontend",
    fragments,
    agentsMd,
    sandboxId: args.sandboxId,
  });

  const tools = [
    ...buildAllFeTools(args.sandboxId),
    buildDelegateTool({
      parentRunId: args.parentRunId,
      sandboxId: args.sandboxId,
      threadId: args.threadId,
      registry: FE_SUBAGENTS,
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
