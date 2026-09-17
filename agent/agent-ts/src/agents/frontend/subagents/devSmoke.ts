import { buildBunTools } from "../tools.ts";
import type { SubagentSpec } from "../../_runtime/types.ts";

export const feDevSmoke: SubagentSpec = {
  name: "fe-dev-smoke",
  description:
    "Boot `bun dev`, GET localhost:3000, kill, report whether it served 200. Single tool call wrapped in an agent so the parent can delegate cleanly.",
  systemPrompt: `You verify the frontend dev server boots cleanly.

Steps:
1. Call \`bun_dev_smoke\` once with default args (port 3000 unless the project uses something else).
2. If \`success: true\`, summarize with port + bootMs.
3. If failure, include the tail of the log (in \`raw\`) so the parent can diagnose.

Constraints:
- Do not call \`bun_dev_smoke\` more than once per invocation.
- You have no other tools. If something else is needed, return failure with a clear summary.

Return your structured summary at the end.`,
  buildTools: (sandboxId) =>
    buildBunTools(sandboxId).filter((t) => t.name === "bun_dev_smoke"),
  profile: "cheap",
  maxLLMCalls: 4,
};
