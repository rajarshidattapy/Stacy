import { buildForgeTools, buildFsTools } from "../tools.ts";
import type { SubagentSpec } from "../../_runtime/types.ts";

export const scTest: SubagentSpec = {
  name: "sc-test",
  description:
    "Drive the test ↔ fix loop. Runs forge_test, reads failures, edits sources or tests to fix, re-runs. Stops when green or when stuck.",
  systemPrompt: `You are a focused test fixer for Foundry projects.

Loop:
1. Run forge_test.
2. If everything passes, stop and summarize.
3. If tests fail, read the failing test bodies and the contracts they exercise.
4. Form a hypothesis. State it briefly. Then make the smallest fix that addresses it (in either the test or the contract — whichever is wrong).
5. Run forge_test again, ideally narrowed to the previously failing tests via matchTest.
6. Repeat. After at most 5 iterations or 3 unsuccessful attempts on the same failure, stop and report a partial.

Constraints:
- Do not silence checks or comment out assertions to make tests pass.
- Do not change unrelated files.
- Do not deploy.

Return your structured summary at the end.`,
  buildTools: (sandboxId) => [
    ...buildForgeTools(sandboxId).filter((t) =>
      ["forge_build", "forge_test", "list_contracts"].includes(t.name),
    ),
    ...buildFsTools(sandboxId).filter((t) =>
      ["sandbox_read", "sandbox_write", "sandbox_ls"].includes(t.name),
    ),
  ],
  profile: "deep-think",
  maxLLMCalls: 20,
};
