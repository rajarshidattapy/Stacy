// Single place that maps an agent name to its factory. Shared by the CLI test
// harness and the HTTP server so both build agents identically.
import { createSmartContractAgent } from "./smartContract/index.ts";
import { createAuditAgent } from "./audit/index.ts";
import { createFrontendAgent } from "./frontend/index.ts";
import { createIntegrationAgent } from "./integration/index.ts";
import { createPlannerAgent } from "./planner/index.ts";
import { createOrchestratorAgent } from "./orchestrator/index.ts";

export type AgentName =
  | "smart-contract"
  | "frontend"
  | "integration"
  | "orchestrator"
  | "planner"
  | "audit";

export const AGENT_NAMES: AgentName[] = [
  "smart-contract",
  "frontend",
  "integration",
  "orchestrator",
  "planner",
  "audit",
];

/** Agents that can run without a sandbox. */
export const SANDBOXLESS_AGENTS: ReadonlySet<AgentName> = new Set(["planner"]);

export function isAgentName(value: unknown): value is AgentName {
  return typeof value === "string" && (AGENT_NAMES as string[]).includes(value);
}

export interface BuildAgentArgs {
  agent: AgentName;
  sandboxId: string | null;
  threadId: string;
  parentRunId: string;
  initialUserMessage: string;
  profileOverride?: string;
  pauseBetweenPhases?: boolean;
}

export async function buildAgent(args: BuildAgentArgs): Promise<{ agent: unknown }> {
  const { agent, sandboxId, threadId, parentRunId, initialUserMessage, profileOverride } = args;

  if (agent === "planner") {
    return createPlannerAgent({ threadId, parentRunId, initialUserMessage, profileOverride });
  }

  if (!sandboxId) throw new Error(`${agent} agent requires a sandbox`);
  const common = { sandboxId, threadId, parentRunId, initialUserMessage, profileOverride };

  switch (agent) {
    case "smart-contract":
      return createSmartContractAgent(common);
    case "audit":
      return createAuditAgent(common);
    case "frontend":
      return createFrontendAgent(common);
    case "integration":
      return createIntegrationAgent(common);
    case "orchestrator":
      return createOrchestratorAgent({
        ...common,
        pauseBetweenPhases: args.pauseBetweenPhases ?? true,
      });
  }
}
