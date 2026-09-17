// Audit agent factory. Returns a deepagents instance configured with:
//   - read-only sandbox FS tools, slither_audit, write_audit_report
//   - skills filesystem backend (read-only, deny-write permissions)
//   - audit base prompt + thorough/quick fragment based on user message
//   - PostgresSaver checkpointer for thread resume
//
// No subagents in v0 — single-pass agent. The audit categories live in the
// system prompt and the `audit-checklist` skill the agent loads at runtime.
import { createDeepAgent } from "deepagents";
import { buildAllAuditTools } from "./tools.ts";
import { buildSkillsBackend, READ_ONLY_SKILLS_PERMISSIONS } from "../_runtime/skillsBackend.ts";
import { buildModel } from "../../models/anthropicClient.ts";
import { selectProfile } from "../../models/selectProfile.ts";
import { composePrompt } from "../../prompts/composer.ts";
import { getCheckpointer } from "../../memory/checkpointer.ts";
import { readFile as readSandboxFile } from "../../tools/filesystem.ts";

export interface CreateAuditAgentArgs {
  sandboxId: string;
  threadId: string;
  parentRunId: string;
  initialUserMessage?: string;
  profileOverride?: string;
}

const QUICK_RE = /\b(quick|fast|lightweight)\b/i;

async function tryReadAgentsMd(sandboxId: string): Promise<string | undefined> {
  const project = await readSandboxFile(sandboxId, { path: "/workspace/AGENTS.md" });
  const contracts = await readSandboxFile(sandboxId, { path: "/workspace/contracts/AGENTS.md" });
  const parts: string[] = [];
  if (project.ok) parts.push(`# /workspace/AGENTS.md\n\n${project.data.content.trim()}`);
  if (contracts.ok) parts.push(`# /workspace/contracts/AGENTS.md\n\n${contracts.data.content.trim()}`);
  return parts.length ? parts.join("\n\n") : undefined;
}

function pickAuditFragment(initialUserMessage?: string): string {
  return initialUserMessage && QUICK_RE.test(initialUserMessage) ? "audit-quick" : "audit-thorough";
}

export async function createAuditAgent(args: CreateAuditAgentArgs) {
  const profileName =
    args.profileOverride ??
    selectProfile({
      agent: "audit",
      lastUserMessage: args.initialUserMessage,
    });

  const fragments = [pickAuditFragment(args.initialUserMessage)];
  const agentsMd = await tryReadAgentsMd(args.sandboxId);

  const systemPrompt = await composePrompt({
    base: "audit",
    fragments,
    agentsMd,
    sandboxId: args.sandboxId,
  });

  const tools = buildAllAuditTools(args.sandboxId);
  const model = buildModel(profileName);
  const checkpointer = await getCheckpointer();

  const agent = createDeepAgent({
    model,
    tools,
    systemPrompt,
    // Built-in `read_file` / `ls` / `glob` / `grep` operate on the agent's
    // local skills directory. The audit agent uses these to read
    // `/audit-checklist/SKILL.md`, `/slither-output-interpretation/SKILL.md`,
    // and other reference skills. The `sandbox_*` tools are the only path
    // to the user's project (read-only).
    backend: buildSkillsBackend(),
    permissions: READ_ONLY_SKILLS_PERMISSIONS,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    checkpointer: checkpointer as any,
  });

  return { agent, profileName };
}
