// Foundry tool wrappers. Each calls bash() inside the sandbox and parses the
// output into a structured shape so the LLM doesn't have to grep raw stdout.
//
// All tools assume the contracts project lives at /workspace/contracts/.
// .env (RPC_URL, PRIVATE_KEY) is provisioned by the central backend before
// the agent runs.
import { bash } from "./bash.ts";
import { readFile, writeFile, listDir, globFiles } from "./filesystem.ts";
import { ok, err, type Result } from "./result.ts";

const CONTRACTS_DIR = "/workspace/contracts";
const SEPOLIA_CHAIN_ID = 11155111;

// ── forge_build ─────────────────────────────────────────────────────────────
export interface ForgeBuildResult {
  success: boolean;
  warnings: string[];
  errors: string[];
  raw: string;
}

export async function forgeBuild(sandboxId: string): Promise<Result<ForgeBuildResult>> {
  const r = await bash(sandboxId, "forge build", { cwd: CONTRACTS_DIR });
  if (!r.ok) return r;
  const { stdout, stderr, exitCode } = r.data;
  const combined = `${stdout}\n${stderr}`;
  const warnings = combined.split("\n").filter((l) => /^Warning/i.test(l) || /\bwarning:/i.test(l));
  const errors = combined.split("\n").filter((l) => /^Error/i.test(l) || /\berror\[/i.test(l));
  return ok({
    success: exitCode === 0,
    warnings,
    errors,
    raw: combined.slice(-4000),
  });
}

// ── forge_test ──────────────────────────────────────────────────────────────
export interface ForgeTestResult {
  success: boolean;
  passed: number;
  failed: number;
  skipped: number;
  failingTests: Array<{ test: string; reason: string }>;
  raw: string;
}

export async function forgeTest(
  sandboxId: string,
  args: { matchTest?: string; verbosity?: number } = {},
): Promise<Result<ForgeTestResult>> {
  const verbosity = args.verbosity ?? 2;
  const v = verbosity > 0 ? "-" + "v".repeat(Math.min(verbosity, 5)) : "";
  const match = args.matchTest ? ` --match-test ${shellQuote(args.matchTest)}` : "";
  const cmd = `forge test ${v}${match}`.trim();
  const r = await bash(sandboxId, cmd, { cwd: CONTRACTS_DIR });
  if (!r.ok) return r;
  const { stdout, stderr, exitCode } = r.data;
  const combined = `${stdout}\n${stderr}`;
  const passed = countMatches(combined, /\[PASS\]/g);
  const failed = countMatches(combined, /\[FAIL/g);
  const skipped = countMatches(combined, /\[SKIP\]/g);
  const failingTests: Array<{ test: string; reason: string }> = [];
  for (const m of combined.matchAll(/\[FAIL[^\]]*\]\s+([^\s(]+)\(\)\s*\(([^)]*)\)/g)) {
    failingTests.push({ test: m[1], reason: m[2] });
  }
  return ok({
    success: exitCode === 0,
    passed,
    failed,
    skipped,
    failingTests,
    raw: combined.slice(-6000),
  });
}

// ── forge_fmt ───────────────────────────────────────────────────────────────
export async function forgeFmt(sandboxId: string): Promise<Result<{ success: boolean; raw: string }>> {
  const r = await bash(sandboxId, "forge fmt", { cwd: CONTRACTS_DIR });
  if (!r.ok) return r;
  return ok({ success: r.data.exitCode === 0, raw: `${r.data.stdout}\n${r.data.stderr}`.slice(-2000) });
}

// ── forge_inspect_abi ───────────────────────────────────────────────────────
export async function forgeInspectAbi(
  sandboxId: string,
  args: { contractName: string },
): Promise<Result<{ contractName: string; abi: unknown }>> {
  const r = await bash(sandboxId, `forge inspect ${shellQuote(args.contractName)} abi --json`, {
    cwd: CONTRACTS_DIR,
  });
  if (!r.ok) return r;
  if (r.data.exitCode !== 0) {
    return err(`forge inspect failed: ${r.data.stderr.slice(-500)}`, "INSPECT_FAILED");
  }
  try {
    const abi = JSON.parse(r.data.stdout);
    return ok({ contractName: args.contractName, abi });
  } catch (e) {
    return err(`failed to parse ABI JSON: ${(e as Error).message}`, "PARSE_FAILED");
  }
}

// ── extract_abi ─────────────────────────────────────────────────────────────
// Builds, then reads out/<contractFile>/<contractName>.json, extracts .abi,
// and persists to /workspace/contracts/.deployments/<contractName>.abi.json.
export async function extractAbi(
  sandboxId: string,
  args: { contractFile: string; contractName: string },
): Promise<Result<{ contractName: string; abiPath: string; selectors: number }>> {
  const build = await forgeBuild(sandboxId);
  if (!build.ok) return build;
  if (!build.data.success) return err(`forge build failed before extracting ABI`, "BUILD_FAILED");

  const artifactPath = `${CONTRACTS_DIR}/out/${args.contractFile}/${args.contractName}.json`;
  const read = await readFile(sandboxId, { path: artifactPath });
  if (!read.ok) return err(`could not read artifact ${artifactPath}: ${read.error}`, "ARTIFACT_NOT_FOUND");

  let parsed: { abi?: unknown };
  try {
    parsed = JSON.parse(read.data.content) as { abi?: unknown };
  } catch (e) {
    return err(`could not parse artifact JSON: ${(e as Error).message}`, "PARSE_FAILED");
  }
  if (!Array.isArray(parsed.abi)) return err(`artifact has no .abi array`, "NO_ABI");

  const abiJson = JSON.stringify(parsed.abi, null, 2);
  const abiPath = `${CONTRACTS_DIR}/.deployments/${args.contractName}.abi.json`;
  await bash(sandboxId, `mkdir -p ${CONTRACTS_DIR}/.deployments`);
  const write = await writeFile(sandboxId, { path: abiPath, content: abiJson });
  if (!write.ok) return write;

  const selectors = (parsed.abi as Array<{ type?: string }>).filter(
    (e) => e.type === "function" || e.type === "event" || e.type === "error",
  ).length;
  return ok({ contractName: args.contractName, abiPath, selectors });
}

// ── read_deployed_address ───────────────────────────────────────────────────
// Walks broadcast/*/<chainId>/run-latest.json, finds CREATE entries matching
// contractName, returns the address. Persists to .deployments/<n>.address.
export async function readDeployedAddress(
  sandboxId: string,
  args: { contractName: string; chainId?: number },
): Promise<Result<{ contractName: string; chainId: number; address: string; addressPath: string }>> {
  const chainId = args.chainId ?? SEPOLIA_CHAIN_ID;
  const list = await listDir(sandboxId, { path: `${CONTRACTS_DIR}/broadcast` });
  if (!list.ok) return err(`no broadcast directory: ${list.error}`, "NO_BROADCAST");

  const scriptDirs = list.data.entries
    .filter((e) => e.is_dir)
    .map((e) => e.path.split("/").filter(Boolean).pop() ?? "")
    .filter((n) => n.length > 0);
  if (scriptDirs.length === 0) return err(`no scripts under broadcast/`, "NO_SCRIPTS");

  // Search every script's <chainId>/run-latest.json for a CREATE matching
  // contractName, take the most recently modified one.
  type Hit = { address: string; mtime: number; runFile: string };
  const hits: Hit[] = [];
  for (const scriptDir of scriptDirs) {
    const runFile = `${CONTRACTS_DIR}/broadcast/${scriptDir}/${chainId}/run-latest.json`;
    const stat = await bash(sandboxId, `stat -c %Y ${runFile} 2>/dev/null || echo 0`);
    const mtime = stat.ok ? parseInt(stat.data.stdout.trim(), 10) || 0 : 0;
    if (mtime === 0) continue;
    const r = await readFile(sandboxId, { path: runFile });
    if (!r.ok) continue;
    try {
      const json = JSON.parse(r.data.content) as {
        transactions?: Array<{ transactionType?: string; contractName?: string; contractAddress?: string }>;
      };
      const txs = json.transactions ?? [];
      const match = txs.find(
        (t) => t.transactionType === "CREATE" && t.contractName === args.contractName && t.contractAddress,
      );
      if (match?.contractAddress) hits.push({ address: match.contractAddress, mtime, runFile });
    } catch { /* ignore */ }
  }
  if (hits.length === 0) {
    return err(`no broadcast entry for ${args.contractName} on chain ${chainId}`, "NOT_FOUND");
  }
  hits.sort((a, b) => b.mtime - a.mtime);
  const best = hits[0];

  const addressPath = `${CONTRACTS_DIR}/.deployments/${args.contractName}.address`;
  await bash(sandboxId, `mkdir -p ${CONTRACTS_DIR}/.deployments`);
  await writeFile(sandboxId, { path: addressPath, content: `${best.address}\n` });

  return ok({ contractName: args.contractName, chainId, address: best.address, addressPath });
}

// ── forge_deploy_sepolia ────────────────────────────────────────────────────
// Sources .env first for RPC_URL, PRIVATE_KEY, and DEPLOY_IDEMPOTENCY_TTL_MINUTES.
// If a broadcast for (scriptPath, SEPOLIA_CHAIN_ID) exists and its mtime is
// within the TTL window, the broadcast is skipped and skipped=true is returned.
// Pass force=true to override.
export interface DeployResult {
  success: boolean;
  scriptPath: string;
  raw: string;
  skipped?: boolean;
}

export async function forgeDeploySepolia(
  sandboxId: string,
  args: { scriptPath: string; sig?: string; force?: boolean },
): Promise<Result<DeployResult>> {
  if (!args.force) {
    const ttlR = await bash(
      sandboxId,
      `set -a; . ${CONTRACTS_DIR}/.env 2>/dev/null; set +a; printf '%s' "\${DEPLOY_IDEMPOTENCY_TTL_MINUTES:-10}"`,
    );
    const ttlMinutes = ttlR.ok ? parseInt(ttlR.data.stdout.trim(), 10) || 10 : 10;

    const scriptBasename = args.scriptPath.split("/").pop()!;
    const broadcastFile = `${CONTRACTS_DIR}/broadcast/${scriptBasename}/${SEPOLIA_CHAIN_ID}/run-latest.json`;
    const statR = await bash(sandboxId, `stat -c %Y "${broadcastFile}" 2>/dev/null || echo 0`);
    const mtime = statR.ok ? parseInt(statR.data.stdout.trim(), 10) || 0 : 0;
    const ageSecs = Math.floor(Date.now() / 1000) - mtime;

    if (mtime > 0 && ageSecs < ttlMinutes * 60) {
      return ok({
        success: true,
        scriptPath: args.scriptPath,
        raw: `IDEMPOTENT: recent broadcast exists (age ${ageSecs}s, TTL ${ttlMinutes * 60}s). Pass force=true to redeploy.`,
        skipped: true,
      });
    }
  }

  const sig = args.sig ?? "run()";
  const cmd =
    `set -a; . ./.env; set +a; ` +
    `forge script ${shellQuote(args.scriptPath)} --sig ${shellQuote(sig)} ` +
    `--rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" --broadcast --slow`;
  const r = await bash(sandboxId, cmd, { cwd: CONTRACTS_DIR, timeout: "5m" });
  if (!r.ok) return r;
  const combined = `${r.data.stdout}\n${r.data.stderr}`;
  return ok({
    success: r.data.exitCode === 0 && /ONCHAIN EXECUTION COMPLETE/i.test(combined),
    scriptPath: args.scriptPath,
    raw: combined.slice(-6000),
  });
}

// ── deploy_contract (composite) ─────────────────────────────────────────────
// One-shot deploy pipeline: forge_deploy_sepolia (idempotent) →
// read_deployed_address → extract_abi. Returned shape gives the parent agent
// everything it needs without spawning a sub-LLM. If the deploy was skipped
// because of the idempotency window, the address/ABI lookups still run so the
// caller gets a coherent result.
export interface DeployContractResult {
  success: boolean;
  contractName: string;
  scriptPath: string;
  address: string;
  addressPath: string;
  abiPath: string;
  selectors: number;
  skipped: boolean;
  deployRaw: string;
}

export async function deployContract(
  sandboxId: string,
  args: {
    scriptPath: string;
    contractName: string;
    contractFile?: string;   // defaults to `${contractName}.sol`
    sig?: string;
    force?: boolean;
    chainId?: number;
  },
): Promise<Result<DeployContractResult>> {
  const contractFile = args.contractFile ?? `${args.contractName}.sol`;
  const chainId = args.chainId ?? SEPOLIA_CHAIN_ID;

  const deploy = await forgeDeploySepolia(sandboxId, {
    scriptPath: args.scriptPath,
    sig: args.sig,
    force: args.force,
  });
  if (!deploy.ok) return deploy;
  if (!deploy.data.success) {
    return err(`forge_deploy_sepolia failed: ${deploy.data.raw.slice(-1500)}`, "DEPLOY_FAILED");
  }

  const addr = await readDeployedAddress(sandboxId, { contractName: args.contractName, chainId });
  if (!addr.ok) return err(`deploy succeeded but address lookup failed: ${addr.error}`, "ADDRESS_LOOKUP_FAILED");

  const abi = await extractAbi(sandboxId, { contractFile, contractName: args.contractName });
  if (!abi.ok) return err(`deploy succeeded but ABI extract failed: ${abi.error}`, "ABI_EXTRACT_FAILED");

  return ok({
    success: true,
    contractName: args.contractName,
    scriptPath: args.scriptPath,
    address: addr.data.address,
    addressPath: addr.data.addressPath,
    abiPath: abi.data.abiPath,
    selectors: abi.data.selectors,
    skipped: deploy.data.skipped ?? false,
    deployRaw: deploy.data.raw.slice(-2000),
  });
}

// ── list_contracts ──────────────────────────────────────────────────────────
export async function listContracts(
  sandboxId: string,
): Promise<Result<{ contracts: Array<{ file: string; contractName: string }> }>> {
  const g = await globFiles(sandboxId, { pattern: `${CONTRACTS_DIR}/src/*.sol` });
  if (!g.ok) return g;
  // Also try src subdirectories — the SDK glob may not be recursive.
  const deep = await bash(sandboxId, `find ${CONTRACTS_DIR}/src -name '*.sol' -type f`);
  const files = new Set<string>(g.data.matches);
  if (deep.ok) {
    for (const line of deep.data.stdout.split("\n").map((s) => s.trim()).filter(Boolean)) {
      files.add(line);
    }
  }
  const contracts: Array<{ file: string; contractName: string }> = [];
  for (const path of files) {
    const r = await readFile(sandboxId, { path });
    if (!r.ok) continue;
    for (const m of r.data.content.matchAll(/^\s*(?:abstract\s+)?contract\s+(\w+)/gm)) {
      contracts.push({ file: path.replace(`${CONTRACTS_DIR}/`, ""), contractName: m[1] });
    }
  }
  return ok({ contracts });
}

// ── slither_audit ───────────────────────────────────────────────────────────
export interface SlitherFinding {
  severity: string;
  title: string;
  description: string;
  location?: string;
}

export async function slitherAudit(
  sandboxId: string,
  args: { contractFile?: string } = {},
): Promise<Result<{ findings: SlitherFinding[]; raw: string }>> {
  const target = args.contractFile ?? ".";
  const r = await bash(sandboxId, `slither ${shellQuote(target)} --json -`, {
    cwd: CONTRACTS_DIR,
    timeout: "3m",
  });
  // slither exits non-zero when it finds issues — that is success for us.
  if (!r.ok) return r;
  const { stdout, stderr } = r.data;
  let parsed: {
    success?: boolean;
    results?: { detectors?: Array<{ check: string; impact: string; description: string; elements?: Array<{ source_mapping?: { lines?: number[]; filename_relative?: string } }> }> };
  };
  try {
    parsed = JSON.parse(stdout) as typeof parsed;
  } catch {
    // slither not installed or wrote nothing — surface stderr so the LLM sees why.
    return err(`slither output unparseable: ${stderr.slice(-1000)}`, "SLITHER_FAILED");
  }
  const findings: SlitherFinding[] = (parsed.results?.detectors ?? []).map((d) => {
    const el = d.elements?.[0]?.source_mapping;
    const loc = el ? `${el.filename_relative}:${(el.lines ?? []).join(",")}` : undefined;
    return { severity: d.impact, title: d.check, description: d.description, location: loc };
  });
  return ok({ findings, raw: stderr.slice(-2000) });
}

// ── helpers ─────────────────────────────────────────────────────────────────
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function countMatches(s: string, re: RegExp): number {
  let n = 0;
  for (const _ of s.matchAll(re)) n++;
  return n;
}
