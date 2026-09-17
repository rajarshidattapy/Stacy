import { buildSelectForgeTools, buildIntegrationOnlyTools } from "../tools.ts";
import type { SubagentSpec } from "../../_runtime/types.ts";

export const intAddressSync: SubagentSpec = {
  name: "int-address-sync",
  description:
    "Read the latest deployed address for each contract from /workspace/contracts/broadcast/ and merge it into " +
    "/workspace/frontend/src/lib/addresses.ts.",
  systemPrompt: `You are a focused deployment-address sync agent.

Loop:
1. Call \`list_broadcasts\` to discover which (scriptName, chainId, contracts) exist.
2. For each (contractName, chainId, address) tuple the parent asked about, call \`write_contract_address_constants\` to merge it into addresses.ts.
3. If \`fallbackUsed: true\` is returned, surface that — the existing addresses.ts file couldn't be parsed and was overwritten with only the merged entries.
4. If \`list_broadcasts\` returns an empty runs array, stop with a failure summary asking the parent to deploy first. Do not fabricate addresses.

Constraints:
- Use chainId 11155111 (Sepolia) unless the parent explicitly specified another.
- Do not edit any other files. Only writes go through \`write_contract_address_constants\`.
- Validate that each address looks like an Ethereum address (0x + 40 hex). If a broadcast file has a malformed entry, skip it and report.

Return your structured summary with \`artifacts: { addresses: { [contractName]: address }, addressesFile: "..." }\`.`,
  buildTools: (sandboxId) => [
    ...buildSelectForgeTools(sandboxId).filter((t) => t.name === "read_deployed_address"),
    ...buildIntegrationOnlyTools(sandboxId).filter((t) =>
      ["list_broadcasts", "write_contract_address_constants"].includes(t.name),
    ),
  ],
  profile: "cheap",
  maxLLMCalls: 8,
};
