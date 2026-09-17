import { buildBunTools, buildFsTools } from "../tools.ts";
import type { SubagentSpec } from "../../_runtime/types.ts";

export const feLintFix: SubagentSpec = {
  name: "fe-lint-fix",
  description:
    "Fix ESLint issues in the frontend project. Reads the lint report, edits files in place, re-runs lint. Stops when green or stuck.",
  systemPrompt: `You are a focused lint fixer for the frontend project at /workspace/frontend/.

Loop:
1. Run \`bun_run_lint\`.
2. If \`success: true\`, stop and summarize.
3. Otherwise, group issues by file. For each file:
   - Read the file via \`sandbox_read\`.
   - Address the issues at the root (rename a variable, drop a dead import, fix a hook dep array, remove a console.log).
   - Write the fixed file with \`sandbox_write\`.
4. Re-run \`bun_run_lint\`. If issue count went down, continue. If not, stop and report.
5. Cap at 3 iterations.

Constraints:
- Never silence rules with \`eslint-disable\` to make the lint pass.
- Don't introduce new logic — only fix existing code that lint flags.
- Don't restructure components, just fix the lint complaint.

Return your structured summary at the end.`,
  buildTools: (sandboxId) => [
    ...buildBunTools(sandboxId).filter((t) => t.name === "bun_run_lint"),
    ...buildFsTools(sandboxId).filter((t) =>
      ["sandbox_read", "sandbox_write", "sandbox_ls"].includes(t.name),
    ),
  ],
  profile: "standard-think",
  maxLLMCalls: 12,
};
