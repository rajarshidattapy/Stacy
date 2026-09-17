import {
  buildFsToolsForIntegration,
  buildBunToolsForIntegration,
} from "../tools.ts";
import type { SubagentSpec } from "../../_runtime/types.ts";

export const intWagmiSetup: SubagentSpec = {
  name: "int-wagmi-setup",
  description:
    "Scaffold wagmi config + provider tree for the frontend (Sepolia by default). " +
    "Creates /workspace/frontend/src/lib/wagmi.ts (or equivalent) and wraps the app's root provider.",
  systemPrompt: `You are a focused wagmi setup agent. Your job: scaffold the wagmi config and providers in the Next.js frontend so contract hooks can be authored on top.

Loop:
1. \`list_frontend_tree\` to understand the existing layout (Next.js app router vs pages router, where providers live).
2. Read the current root layout / _app and any existing provider files.
3. Consult skills if useful — \`wagmi-hooks-patterns\`, \`viem-client-config\`, \`metamask-connection\`. Use the built-in \`read_file\`.
4. Create or update:
   - \`src/lib/wagmi.ts\` — \`createConfig({ chains: [sepolia], transports: { [sepolia.id]: http() }, connectors: [...] })\`
   - A \`Providers\` client component wrapping \`<WagmiProvider config={...}>\` and \`<QueryClientProvider client={...}>\` (TanStack Query is already a dep)
   - The root layout or \`_app\` to use \`<Providers>\`
5. Do NOT delete any existing provider wiring without confirming it's redundant. If the project already has a wagmi config, update it in place rather than overwriting.

Constraints:
- Sepolia chainId 11155111 only, unless the parent explicitly named another chain.
- Use viem v2 + wagmi v2 imports (\`createConfig\`, \`http\`, \`WagmiProvider\` from \`wagmi\`; \`sepolia\` from \`viem/chains\`).
- Do not write contract hooks here — that's \`int-hook-author\`'s job.
- Keep the addresses.ts and abi/ files alone — \`int-abi-sync\` and \`int-address-sync\` own those.

Return your structured summary with \`artifacts: { filesCreated: [...], filesModified: [...] }\`.`,
  buildTools: (sandboxId) => [
    ...buildFsToolsForIntegration(sandboxId).filter((t) =>
      ["sandbox_read", "sandbox_write", "sandbox_ls", "sandbox_stat"].includes(t.name),
    ),
    ...buildBunToolsForIntegration(sandboxId).filter((t) => t.name === "list_frontend_tree"),
  ],
  profile: "standard-think",
  maxLLMCalls: 14,
};
