import type { SubagentSpec } from "../_runtime/types.ts";
import { buildAllScTools } from "../smartContract/tools.ts";
import { SC_SUBAGENTS } from "../smartContract/subagents/index.ts";
import { buildAllFeTools } from "../frontend/tools.ts";
import { FE_SUBAGENTS } from "../frontend/subagents/index.ts";
import { buildAllIntegrationTools } from "../integration/tools.ts";
import { INTEGRATION_SUBAGENTS } from "../integration/subagents/index.ts";

import { buildDelegateTool } from "../_runtime/delegateTool.ts";
import { composePrompt } from "../../prompts/composer.ts";
import { selectFragments } from "../../prompts/selector.ts";
import { selectProfile } from "../../models/selectProfile.ts";
import { readFile as readSandboxFile, listDir as listSandboxDir } from "../../tools/filesystem.ts";
import { listBroadcasts } from "../../tools/integration.ts";

async function tryReadAgentsMd(sandboxId: string, scopes: string[]): Promise<string | undefined> {
  const parts: string[] = [];
  for (const scope of scopes) {
    const path = scope === "project" ? "/workspace/AGENTS.md" : `/workspace/${scope}/AGENTS.md`;
    const res = await readSandboxFile(sandboxId, { path });
    if (res.ok) parts.push(`# ${path}\n\n${res.data.content.trim()}`);
  }
  return parts.length ? parts.join("\n\n") : undefined;
}

export const ORCHESTRATOR_SUBAGENTS: Record<string, SubagentSpec> = {
  "smart-contract": {
    name: "smart-contract",
    description: "Builds and deploys the smart contracts (Solidity/Foundry).",
    profile: selectProfile({ agent: "smart-contract" }),
    maxLLMCalls: 50,
    systemPrompt: async (sandboxId) => {
      const fragments = selectFragments({ agent: "smart-contract" });
      const agentsMd = await tryReadAgentsMd(sandboxId, ["project", "contracts"]);
      return await composePrompt({ base: "smart-contract", fragments, agentsMd, sandboxId });
    },
    buildTools: (sandboxId, parentRunId, threadId) => {
      if (!parentRunId || !threadId) throw new Error("parentRunId and threadId required for full agent subagent");
      return [
        ...buildAllScTools(sandboxId),
        buildDelegateTool({ parentRunId, threadId, sandboxId, registry: SC_SUBAGENTS }),
      ];
    },
  },
  "frontend": {
    name: "frontend",
    description: "Builds the React/Next.js UI components and pages.",
    profile: selectProfile({ agent: "frontend" }),
    maxLLMCalls: 50,
    systemPrompt: async (sandboxId) => {
      const ls = await listSandboxDir(sandboxId, { path: "/workspace/frontend/node_modules" });
      const fresh = !ls.ok || (ls.data.entries?.length ?? 0) === 0;
      const fragments = selectFragments({ agent: "frontend", freshFrontend: fresh });
      const agentsMd = await tryReadAgentsMd(sandboxId, ["project", "frontend"]);
      return await composePrompt({ base: "frontend", fragments, agentsMd, sandboxId });
    },
    buildTools: (sandboxId, parentRunId, threadId) => {
      if (!parentRunId || !threadId) throw new Error("parentRunId and threadId required for full agent subagent");
      return [
        ...buildAllFeTools(sandboxId),
        buildDelegateTool({ parentRunId, threadId, sandboxId, registry: FE_SUBAGENTS }),
      ];
    },
  },
  "integration": {
    name: "integration",
    description: "Wires the frontend to the deployed smart contracts using wagmi/viem.",
    profile: selectProfile({ agent: "integration" }),
    maxLLMCalls: 50,
    systemPrompt: async (sandboxId) => {
      const r = await listBroadcasts(sandboxId);
      const deployed = r.ok && (r.data.runs?.length ?? 0) > 0;
      const fragments = selectFragments({ agent: "integration", noDeployments: !deployed });
      const agentsMd = await tryReadAgentsMd(sandboxId, ["project", "frontend", "contracts"]);
      return await composePrompt({ base: "integration", fragments, agentsMd, sandboxId });
    },
    buildTools: (sandboxId, parentRunId, threadId) => {
      if (!parentRunId || !threadId) throw new Error("parentRunId and threadId required for full agent subagent");
      return [
        ...buildAllIntegrationTools(sandboxId),
        buildDelegateTool({ parentRunId, threadId, sandboxId, registry: INTEGRATION_SUBAGENTS }),
      ];
    },
  },
};
