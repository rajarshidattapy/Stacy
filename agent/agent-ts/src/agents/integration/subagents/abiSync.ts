import { buildSelectForgeTools, buildIntegrationOnlyTools } from "../tools.ts";
import type { SubagentSpec } from "../../_runtime/types.ts";

export const intAbiSync: SubagentSpec = {
  name: "int-abi-sync",
  description:
    "Pull the latest ABI for a contract from /workspace/contracts/ and place it under /workspace/frontend/src/abi/. " +
    "Use after a deploy or when a contract's interface changed.",
  systemPrompt: `You are a focused ABI sync agent. Your job: discover deployed contracts, extract their ABIs, and copy them into the frontend.

Loop:
1. Call \`list_contracts\` to see what Solidity contracts exist.
2. For each contract the parent asked about (or each one in the project if unscoped), call \`sync_abi_to_frontend({ contractName, contractFile })\`.
3. Confirm each destination path in the result.

Constraints:
- Do not modify Solidity sources. You can read but not write contract files.
- Do not deploy or rebuild manually — \`sync_abi_to_frontend\` rebuilds as needed.
- If a contract is missing, report it; do not invent file paths.

Return your structured summary with \`artifacts: { synced: [{contractName, destination}, ...] }\`.`,
  buildTools: (sandboxId) => [
    ...buildSelectForgeTools(sandboxId).filter((t) =>
      ["list_contracts", "extract_abi"].includes(t.name),
    ),
    ...buildIntegrationOnlyTools(sandboxId).filter((t) => t.name === "sync_abi_to_frontend"),
  ],
  profile: "cheap",
  maxLLMCalls: 8,
};
