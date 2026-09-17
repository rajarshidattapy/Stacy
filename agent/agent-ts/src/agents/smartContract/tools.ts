// LangChain `tool(...)` wrappers around our scoped filesystem, bash, and
// forge primitives. The SC agent and its subagents pick subsets of this.
//
// Tool names use a `sandbox_` prefix to make the split explicit:
//   - `sandbox_*` → the user's project inside the StacyVM container
//   - built-in `read_file` / `ls` / `glob` / `grep` (from deepagents) → the
//     skills library on the agent backend host
// Without the prefix the names would collide with deepagents' built-in tools
// and `createDeepAgent` would throw a TOOL_NAME_COLLISION ConfigurationError.
//
// The sandbox FS tools live in `_runtime/sandboxFsTools.ts` so the Audit
// agent (read-only subset) can share the path-scoping plumbing.
import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import * as forge from "../../tools/forge.ts";
import { buildSandboxFsTools } from "../_runtime/sandboxFsTools.ts";
import { buildBashTool as buildBashToolShared } from "../_runtime/sandboxBashTool.ts";
import { buildSandboxSystemTools } from "../_runtime/sandboxSystemTools.ts";

function asJson(x: unknown): string {
  return typeof x === "string" ? x : JSON.stringify(x);
}

// ── sandbox filesystem (scoped to /workspace/contracts/) ────────────────────
// Re-exported under the original name so subagent specs that call
// `buildFsTools(...).filter(...)` keep working.
export function buildFsTools(sandboxId: string): StructuredToolInterface[] {
  return buildSandboxFsTools(sandboxId, { roots: ["/workspace/contracts"] });
}

// ── bash (scoped to /workspace/contracts/ via cwd) ──────────────────────────
export function buildBashTool(sandboxId: string): StructuredToolInterface {
  return buildBashToolShared(sandboxId, { defaultCwd: "/workspace/contracts" });
}

// ── forge_* tool wrappers ───────────────────────────────────────────────────
export function buildForgeTools(sandboxId: string): StructuredToolInterface[] {
  return [
    tool(async () => asJson(await forge.forgeBuild(sandboxId)), {
      name: "forge_build",
      description: "Run `forge build` in /workspace/contracts. Returns { success, warnings, errors, raw }.",
      schema: z.object({}),
    }),
    tool(async (args) => asJson(await forge.forgeTest(sandboxId, args)), {
      name: "forge_test",
      description: "Run `forge test`. Returns { success, passed, failed, skipped, failingTests, raw }.",
      schema: z.object({
        matchTest: z.string().optional().describe("--match-test pattern"),
        verbosity: z.number().int().min(0).max(5).optional().describe("0-5, maps to -v…-vvvvv"),
      }),
    }),
    tool(async () => asJson(await forge.forgeFmt(sandboxId)), {
      name: "forge_fmt",
      description: "Run `forge fmt`.",
      schema: z.object({}),
    }),
    tool(async (args) => asJson(await forge.forgeInspectAbi(sandboxId, args)), {
      name: "forge_inspect_abi",
      description: "Inspect ABI for a contract via `forge inspect <name> abi --json`.",
      schema: z.object({ contractName: z.string() }),
    }),
    tool(async (args) => asJson(await forge.extractAbi(sandboxId, args)), {
      name: "extract_abi",
      description:
        "Build, then read out/<contractFile>/<contractName>.json, write the ABI to /workspace/contracts/.deployments/<contractName>.abi.json.",
      schema: z.object({
        contractFile: z.string().describe("E.g. 'Counter.sol' (just the file name; lives under contracts/src/)"),
        contractName: z.string(),
      }),
    }),
    tool(async (args) => asJson(await forge.readDeployedAddress(sandboxId, args)), {
      name: "read_deployed_address",
      description:
        "Find the most recent deployed address for a contract by walking broadcast/*/<chainId>/run-latest.json. Persists to .deployments/<contractName>.address.",
      schema: z.object({
        contractName: z.string(),
        chainId: z.number().int().optional().describe("default 11155111 (Sepolia)"),
      }),
    }),
    tool(async (args) => asJson(await forge.deployContract(sandboxId, args)), {
      name: "deploy_contract",
      description:
        "Deploy a contract end-to-end: runs forge script (idempotent — skips if a recent broadcast exists within " +
        "DEPLOY_IDEMPOTENCY_TTL_MINUTES from .env, default 10), then resolves the deployed address from broadcast/, " +
        "then extracts ABI to /workspace/contracts/.deployments/. Returns { success, address, addressPath, abiPath, " +
        "selectors, skipped }. Use this for the standard deploy flow. Pass force=true only when the user explicitly " +
        "wants a redeploy.",
      schema: z.object({
        scriptPath: z.string().describe("Relative to /workspace/contracts/, e.g. 'script/Counter.s.sol'"),
        contractName: z.string().describe("Contract symbol, e.g. 'Counter'"),
        contractFile: z.string().optional().describe("Defaults to '<contractName>.sol'; override if file != name"),
        sig: z.string().optional().describe("--sig argument; defaults to 'run()'"),
        force: z.boolean().optional().describe("Set true only on explicit user redeploy request"),
        chainId: z.number().int().optional().describe("default 11155111 (Sepolia)"),
      }),
    }),
    tool(async (args) => asJson(await forge.forgeDeploySepolia(sandboxId, args)), {
      name: "forge_deploy_sepolia",
      description:
        "Low-level deploy primitive. Prefer `deploy_contract` for the standard flow (it handles address + ABI). " +
        "Use this only for unusual scripts that don't match the standard deploy pipeline. " +
        "Sources .env and runs `forge script ...--broadcast`. Idempotent same as deploy_contract.",
      schema: z.object({
        scriptPath: z.string().describe("Relative to /workspace/contracts/, e.g. 'script/Counter.s.sol'"),
        sig: z.string().optional().describe("--sig argument; defaults to 'run()'"),
        force: z.boolean().optional().describe("Set true to redeploy even if a recent broadcast exists"),
      }),
    }),
    tool(async () => asJson(await forge.listContracts(sandboxId)), {
      name: "list_contracts",
      description: "Walk contracts/src/ for .sol files and parse contract declarations.",
      schema: z.object({}),
    }),
    tool(async (args) => asJson(await forge.slitherAudit(sandboxId, args)), {
      name: "slither_audit",
      description: "Run slither and return parsed findings. Use for self-checks; the dedicated audit agent runs more.",
      schema: z.object({
        contractFile: z.string().optional().describe("Specific contract file or omit for the whole project"),
      }),
    }),
  ];
}

// All SC tools, used by the parent SC agent.
export function buildAllScTools(sandboxId: string): StructuredToolInterface[] {
  return [
    ...buildSandboxSystemTools(sandboxId),
    ...buildFsTools(sandboxId),
    buildBashTool(sandboxId),
    ...buildForgeTools(sandboxId),
  ];
}
