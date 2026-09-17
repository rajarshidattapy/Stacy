// Smart Contract agent factory. Returns a deepagents instance configured
// with: scoped FS + bash + forge tools, the `delegate` tool that wires our
// 5 SC subagents through the circuit-breaker runner, and a system prompt
// composed from the SC base + selected fragments + AGENTS.md (if present).
//
// The agent uses the global PostgresSaver checkpointer so threads can resume
// across CLI invocations.
import { createDeepAgent } from "deepagents";
import { buildAllScTools } from "./tools.ts";
import { SC_SUBAGENTS } from "./subagents/index.ts";
import { buildDelegateTool } from "../_runtime/delegateTool.ts";
import { buildSkillsBackend, READ_ONLY_SKILLS_PERMISSIONS } from "../_runtime/skillsBackend.ts";
import { buildModel } from "../../models/anthropicClient.ts";
import { selectProfile } from "../../models/selectProfile.ts";
import { composePrompt } from "../../prompts/composer.ts";
import { selectFragments } from "../../prompts/selector.ts";
import { getCheckpointer } from "../../memory/checkpointer.ts";
import { readFile as readSandboxFile } from "../../tools/filesystem.ts";

export interface CreateSmartContractAgentArgs {
  sandboxId: string;
  threadId: string;
  parentRunId: string;
  initialUserMessage?: string;   // used for fragment selection on the very first turn
  profileOverride?: string;
}

async function tryReadAgentsMd(sandboxId: string): Promise<string | undefined> {
  // Project-wide first, then contract-scoped — concat both if both exist.
  const project = await readSandboxFile(sandboxId, { path: "/workspace/AGENTS.md" });
  const contracts = await readSandboxFile(sandboxId, { path: "/workspace/contracts/AGENTS.md" });
  const parts: string[] = [];
  if (project.ok) parts.push(`# /workspace/AGENTS.md\n\n${project.data.content.trim()}`);
  if (contracts.ok) parts.push(`# /workspace/contracts/AGENTS.md\n\n${contracts.data.content.trim()}`);
  return parts.length ? parts.join("\n\n") : undefined;
}

export async function createSmartContractAgent(args: CreateSmartContractAgentArgs) {
  const profileName =
    args.profileOverride ??
    selectProfile({
      agent: "smart-contract",
      lastUserMessage: args.initialUserMessage,
    });

  const fragments = selectFragments({
    agent: "smart-contract",
    lastUserMessage: args.initialUserMessage,
  });

  const agentsMd = await tryReadAgentsMd(args.sandboxId);

  const systemPrompt = await composePrompt({
    base: "smart-contract",
    fragments,
    agentsMd,
    sandboxId: args.sandboxId,
  });

  const tools = [
    ...buildAllScTools(args.sandboxId),
    buildDelegateTool({
      parentRunId: args.parentRunId,
      sandboxId: args.sandboxId,
      threadId: args.threadId,
      registry: SC_SUBAGENTS,
    }),
  ];

  const model = buildModel(profileName);
  const checkpointer = await getCheckpointer();

  const agent = createDeepAgent({
    model,
    tools,
    systemPrompt,
    // Built-in `read_file` / `ls` / `glob` / `grep` operate on the agent's
    // local skills directory (see skillsBackend.ts). Sandbox files use the
    // `sandbox_*` tools instead.
    backend: buildSkillsBackend(),
    permissions: READ_ONLY_SKILLS_PERMISSIONS,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    checkpointer: checkpointer as any,
  });

  return { agent, profileName };
}
