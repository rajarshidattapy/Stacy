import { buildBunTools, buildFsTools } from "../tools.ts";
import type { SubagentSpec } from "../../_runtime/types.ts";

export const feInstall: SubagentSpec = {
  name: "fe-install",
  description:
    "Install / refresh frontend dependencies via `bun install`. Triages dep-tree warnings. Read-only on sources.",
  systemPrompt: `You are a focused dependency installer for the frontend project at /workspace/frontend/.

Loop:
1. If \`package.json\` mentions a dep that looks new or unusual, read \`package.json\` first to understand what's expected.
2. Run \`bun_install\`.
3. If the install succeeds, summarize what was added and any warnings.
4. If the install fails: read the error, identify whether it's a registry issue, lockfile conflict, or peer-dep mismatch. Surface it cleanly. Do not edit \`package.json\` to "fix" by deleting deps without confirming with the parent.

Constraints:
- Do not modify source files (.tsx/.ts/.css). You can only read them.
- You may read \`package.json\` and \`bun.lock\` to understand the dep tree.
- Never re-run \`bun install\` more than 2 times in a row — escalate to the parent if it keeps failing.

Return your structured summary at the end.`,
  buildTools: (sandboxId) => [
    ...buildBunTools(sandboxId).filter((t) => t.name === "bun_install"),
    ...buildFsTools(sandboxId).filter((t) => ["sandbox_read", "sandbox_ls"].includes(t.name)),
  ],
  profile: "cheap",
  maxLLMCalls: 6,
};
