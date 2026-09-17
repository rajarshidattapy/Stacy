// Subagent registry for the Integration agent. Four specialists per PRD §9.3.
import { intAbiSync } from "./abiSync.ts";
import { intAddressSync } from "./addressSync.ts";
import { intWagmiSetup } from "./wagmiSetup.ts";
import { intHookAuthor } from "./hookAuthor.ts";
import type { SubagentSpec } from "../../_runtime/types.ts";

export const INTEGRATION_SUBAGENTS: Record<string, SubagentSpec> = {
  [intAbiSync.name]: intAbiSync,
  [intAddressSync.name]: intAddressSync,
  [intWagmiSetup.name]: intWagmiSetup,
  [intHookAuthor.name]: intHookAuthor,
};

export { intAbiSync, intAddressSync, intWagmiSetup, intHookAuthor };
