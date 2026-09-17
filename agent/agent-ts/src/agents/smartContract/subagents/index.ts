// Subagent registry for the Smart Contract agent.
//
// Mechanical, deterministic operations (compile, deploy, ABI extract) are
// composite tools (see deploy_contract in tools/forge.ts), not subagents —
// spinning up a fresh LLM for plumbing wastes tokens, multiplies failure
// modes, and adds nothing the parent's tools can't do directly.
//
// Subagents are reserved for work that genuinely benefits from an isolated
// LLM context: failing-test diagnosis (sc-test) and slither-finding triage
// (sc-quick-audit).
import { scTest } from "./test.ts";
import { scQuickAudit } from "./quickAudit.ts";
import type { SubagentSpec } from "../../_runtime/types.ts";

export const SC_SUBAGENTS: Record<string, SubagentSpec> = {
  [scTest.name]: scTest,
  [scQuickAudit.name]: scQuickAudit,
};

export { scTest, scQuickAudit };
