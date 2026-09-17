// LangChain tool wrappers for the Integration agent. Mirrors SC/FE patterns.
//
// Per the user's PRD amendment (recorded in changes.md): Integration has full
// R/W on BOTH /workspace/contracts/ and /workspace/frontend/. This is broader
// than the original PRD §4.4 read-only-on-contracts stance, justified by the
// fact that integration genuinely writes back into contracts/.deployments/
// (ABIs and addresses) and can fail mysteriously if denied.
//
// Tools:
//   - sandbox_* (full R/W on both roots)
//   - bash (cwd defaults to /workspace/frontend; LLM can override to contracts)
//   - select forge_* read-only tools (extract_abi, list_contracts,
//     read_deployed_address, forge_inspect_abi). NEVER deploy / build / test /
//     fmt / slither — those belong to the SC and Audit agents.
//   - bun_* + list_frontend_tree (so integration can install, build, smoke)
//   - sync_abi_to_frontend, write_contract_address_constants, list_broadcasts
import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import * as forge from "../../tools/forge.ts";
import * as integration from "../../tools/integration.ts";
import { buildSandboxFsTools } from "../_runtime/sandboxFsTools.ts";
import { buildBashTool as buildBashToolShared } from "../_runtime/sandboxBashTool.ts";
import { buildSandboxSystemTools } from "../_runtime/sandboxSystemTools.ts";
import { buildBunTools } from "../frontend/tools.ts";

const FRONTEND_ROOT = "/workspace/frontend";
const CONTRACTS_ROOT = "/workspace/contracts";

function asJson(x: unknown): string {
  return typeof x === "string" ? x : JSON.stringify(x);
}

// ── sandbox FS — full R/W on BOTH frontend and contracts ────────────────────
export function buildFsToolsForIntegration(sandboxId: string): StructuredToolInterface[] {
  return buildSandboxFsTools(sandboxId, { roots: [CONTRACTS_ROOT, FRONTEND_ROOT] });
}

// ── bash, default cwd /workspace/frontend ───────────────────────────────────
export function buildBashTool(sandboxId: string): StructuredToolInterface {
  return buildBashToolShared(sandboxId, {
    defaultCwd: FRONTEND_ROOT,
    scopeHint: `${CONTRACTS_ROOT} or ${FRONTEND_ROOT}`,
  });
}

// ── select forge_* tools (read-only / non-mutating) ─────────────────────────
export function buildSelectForgeTools(sandboxId: string): StructuredToolInterface[] {
  return [
    tool(async (args) => asJson(await forge.extractAbi(sandboxId, args)), {
      name: "extract_abi",
      description:
        "Build the contracts project, then write ABI to /workspace/contracts/.deployments/<contractName>.abi.json. " +
        "Use as a one-shot before sync_abi_to_frontend if the artifact may be stale.",
      schema: z.object({
        contractFile: z.string().describe("E.g. 'Counter.sol' (under contracts/src/)"),
        contractName: z.string(),
      }),
    }),
    tool(async () => asJson(await forge.listContracts(sandboxId)), {
      name: "list_contracts",
      description: "List Solidity contracts in /workspace/contracts/src/. Returns [{ file, contractName }].",
      schema: z.object({}),
    }),
    tool(async (args) => asJson(await forge.readDeployedAddress(sandboxId, args)), {
      name: "read_deployed_address",
      description:
        "Find the most recent deployed address for a contract by walking broadcast/*/<chainId>/run-latest.json. " +
        "Persists to .deployments/<contractName>.address.",
      schema: z.object({
        contractName: z.string(),
        chainId: z.number().int().optional().describe("default 11155111 (Sepolia)"),
      }),
    }),
    tool(async (args) => asJson(await forge.forgeInspectAbi(sandboxId, args)), {
      name: "forge_inspect_abi",
      description:
        "Inspect ABI for a contract via `forge inspect <name> abi --json`. Useful when artifact files may be stale " +
        "but the source compiles.",
      schema: z.object({ contractName: z.string() }),
    }),
  ];
}

// ── integration-only tools ──────────────────────────────────────────────────
export function buildIntegrationOnlyTools(sandboxId: string): StructuredToolInterface[] {
  return [
    tool(async (args) => asJson(await integration.syncAbiToFrontend(sandboxId, args)), {
      name: "sync_abi_to_frontend",
      description:
        "Extract a contract's ABI (rebuilds if needed) and copy it to /workspace/frontend/src/abi/<contractName>.json. " +
        "Returns { contractName, source, destination, bytes, selectors }.",
      schema: z.object({
        contractName: z.string(),
        contractFile: z.string().optional().describe("Defaults to '<contractName>.sol'"),
        outDir: z.string().optional().describe("Default /workspace/frontend/src/abi"),
      }),
    }),
    tool(async (args) => asJson(await integration.writeContractAddressConstants(sandboxId, args)), {
      name: "write_contract_address_constants",
      description:
        "Read-modify-write /workspace/frontend/src/lib/addresses.ts. Merges the new (chainId, contractName, address) " +
        "into the existing object literal; creates the file if missing. Returns { path, merged, created, fallbackUsed }. " +
        "If fallbackUsed is true the original file couldn't be parsed and was overwritten — surface that to the user.",
      schema: z.object({
        contractName: z.string(),
        address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "must be a 0x-prefixed 40-char hex address"),
        chainId: z.number().int().describe("e.g. 11155111 for Sepolia"),
        targetPath: z.string().optional().describe("Default /workspace/frontend/src/lib/addresses.ts"),
      }),
    }),
    tool(async () => asJson(await integration.listBroadcasts(sandboxId)), {
      name: "list_broadcasts",
      description:
        "Walk /workspace/contracts/broadcast/. Returns runs: [{ scriptName, chainId, runFile, deployedContracts }]. " +
        "Use to discover what has been deployed before doing ABI/address sync.",
      schema: z.object({}),
    }),
  ];
}

// ── reuse the FE bun_* tools so integration can install / build / smoke ────
export function buildBunToolsForIntegration(sandboxId: string): StructuredToolInterface[] {
  return buildBunTools(sandboxId);
}

export function buildAllIntegrationTools(sandboxId: string): StructuredToolInterface[] {
  return [
    ...buildSandboxSystemTools(sandboxId),
    ...buildFsToolsForIntegration(sandboxId),
    buildBashTool(sandboxId),
    ...buildSelectForgeTools(sandboxId),
    ...buildBunToolsForIntegration(sandboxId),
    ...buildIntegrationOnlyTools(sandboxId),
  ];
}
