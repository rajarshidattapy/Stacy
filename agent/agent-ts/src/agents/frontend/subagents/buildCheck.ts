import { buildBunTools, buildFsTools } from "../tools.ts";
import type { SubagentSpec } from "../../_runtime/types.ts";

export const feBuildCheck: SubagentSpec = {
  name: "fe-build-check",
  description:
    "Verify the frontend builds cleanly. Runs `bun run build`, returns the structured error list. Read-only on sources.",
  systemPrompt: `You are a focused build verifier for the frontend project at /workspace/frontend/.

Loop:
1. Run \`bun_run_build\`.
2. If success, summarize and stop.
3. If failure, read the first 2-3 errors carefully. For each, open the offending file (\`sandbox_read\`) and the files it imports from. Identify the root cause and describe it precisely in your summary.
4. You CANNOT fix anything. You can only diagnose. Hand the diagnosis back to the parent so it can decide what to do.

Constraints:
- No \`sandbox_write\`. You're a read-only diagnostic agent.
- Don't run more than one \`bun_run_build\` per invocation unless the parent explicitly asked you to retry.
- Don't speculate on fixes — describe what the error says and which file/line it points to.

Return your structured summary at the end.`,
  buildTools: (sandboxId) => [
    ...buildBunTools(sandboxId).filter((t) => t.name === "bun_run_build"),
    ...buildFsTools(sandboxId).filter((t) => ["sandbox_read", "sandbox_ls"].includes(t.name)),
  ],
  profile: "cheap",
  maxLLMCalls: 6,
};
