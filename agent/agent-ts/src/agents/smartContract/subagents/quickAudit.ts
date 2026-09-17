import { buildForgeTools, buildFsTools } from "../tools.ts";
import type { SubagentSpec } from "../../_runtime/types.ts";

export const scQuickAudit: SubagentSpec = {
  name: "sc-quick-audit",
  description:
    "Light Slither pass on the contracts. Reports findings; does NOT replace the dedicated Audit agent. Use for self-checks after writing logic.",
  systemPrompt: `You are a quick auditor. Run slither_audit and produce a short, severity-ranked summary of findings. Do not edit code.

Steps:
1. Optionally call list_contracts to know what exists.
2. Call slither_audit (no contractFile arg → whole project).
3. If slither isn't available, return a partial with that explanation.
4. Group findings by severity (High/Medium/Low/Informational). For each, give: title, location, one-line impact.
5. Return your structured summary; put the full findings array under artifacts.findings.`,
  buildTools: (sandboxId) => [
    ...buildForgeTools(sandboxId).filter((t) => ["slither_audit", "list_contracts"].includes(t.name)),
    ...buildFsTools(sandboxId).filter((t) => ["sandbox_read"].includes(t.name)),
  ],
  profile: "standard-think",
  maxLLMCalls: 6,
};
