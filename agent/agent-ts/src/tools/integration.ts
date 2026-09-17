// Integration tool primitives. Wire deployed contracts into the frontend.
//
// Three primitives:
//   - syncAbiToFrontend: extract ABI from contracts/, copy to frontend/src/abi/
//   - writeContractAddressConstants: read-modify-write addresses.ts
//   - listBroadcasts: walk contracts/broadcast/ and return deployment metadata
//
// PRD §8.4. Reuses extractAbi from forge.ts so the ABI extraction pipeline is
// shared with the SC agent.
import { bash } from "./bash.ts";
import { extractAbi } from "./forge.ts";
import { readFile, writeFile, globFiles } from "./filesystem.ts";
import { ok, err, type Result } from "./result.ts";

const CONTRACTS_DIR = "/workspace/contracts";
const FRONTEND_DIR = "/workspace/frontend";
const DEFAULT_ABI_OUT_DIR = `${FRONTEND_DIR}/src/abi`;
const DEFAULT_ADDRESSES_PATH = `${FRONTEND_DIR}/src/lib/addresses.ts`;

// ── sync_abi_to_frontend ────────────────────────────────────────────────────
export interface SyncAbiResult {
  contractName: string;
  source: string;
  destination: string;
  bytes: number;
  selectors: number;
}

export async function syncAbiToFrontend(
  sandboxId: string,
  args: { contractFile?: string; contractName: string; outDir?: string },
): Promise<Result<SyncAbiResult>> {
  const contractFile = args.contractFile ?? `${args.contractName}.sol`;
  const outDir = args.outDir ?? DEFAULT_ABI_OUT_DIR;

  // Step 1: extract via the canonical forge pipeline. Persists the ABI to
  // /workspace/contracts/.deployments/<name>.abi.json.
  const ext = await extractAbi(sandboxId, { contractFile, contractName: args.contractName });
  if (!ext.ok) return err(`abi extract failed: ${ext.error}`, ext.code ?? "ABI_EXTRACT_FAILED");

  // Step 2: read it back so we have the JSON content.
  const read = await readFile(sandboxId, { path: ext.data.abiPath });
  if (!read.ok) return err(`could not read extracted ABI at ${ext.data.abiPath}: ${read.error}`, "ABI_READ_FAILED");

  // Step 3: ensure destination dir exists, then write.
  const mk = await bash(sandboxId, `mkdir -p ${shellQuote(outDir)}`);
  if (!mk.ok) return err(`could not create ${outDir}: ${mk.error}`, "MKDIR_FAILED");

  const dest = `${outDir.replace(/\/$/, "")}/${args.contractName}.json`;
  const write = await writeFile(sandboxId, { path: dest, content: read.data.content });
  if (!write.ok) return err(`could not write ${dest}: ${write.error}`, "ABI_WRITE_FAILED");

  return ok({
    contractName: args.contractName,
    source: ext.data.abiPath,
    destination: dest,
    bytes: write.data.bytes,
    selectors: ext.data.selectors,
  });
}

// ── write_contract_address_constants ────────────────────────────────────────
// Read-modify-write on /workspace/frontend/src/lib/addresses.ts. Format:
//   export const addresses = { 11155111: { Counter: "0x..." } } as const;
// If the file exists, parse it (regex + JSON.parse with quote fixup), merge
// the new entry, rewrite. If parsing fails, fall back to a fresh object
// containing only the new entry — never crash.
export interface AddressesShape {
  [chainId: number]: { [contractName: string]: string };
}

export interface WriteAddressesResult {
  path: string;
  merged: AddressesShape;
  created: boolean;
  fallbackUsed: boolean;
}

export async function writeContractAddressConstants(
  sandboxId: string,
  args: { contractName: string; address: string; chainId: number; targetPath?: string },
): Promise<Result<WriteAddressesResult>> {
  const targetPath = args.targetPath ?? DEFAULT_ADDRESSES_PATH;

  // Try to read existing file.
  const existing = await readFile(sandboxId, { path: targetPath });

  let merged: AddressesShape = {};
  let created = false;
  let fallbackUsed = false;

  if (existing.ok) {
    const parsed = parseAddressesFile(existing.data.content);
    if (parsed) {
      merged = parsed;
    } else {
      // File exists but we couldn't parse it. Don't clobber blindly — surface
      // a fallback flag so the LLM knows it overwrote something hand-edited.
      fallbackUsed = true;
    }
  } else {
    created = true;
  }

  if (!merged[args.chainId]) merged[args.chainId] = {};
  merged[args.chainId][args.contractName] = args.address;

  // Ensure parent directory exists.
  const parentDir = targetPath.slice(0, targetPath.lastIndexOf("/"));
  const mk = await bash(sandboxId, `mkdir -p ${shellQuote(parentDir)}`);
  if (!mk.ok) return err(`could not create ${parentDir}: ${mk.error}`, "MKDIR_FAILED");

  const content = renderAddressesFile(merged);
  const write = await writeFile(sandboxId, { path: targetPath, content });
  if (!write.ok) return err(`could not write ${targetPath}: ${write.error}`, "WRITE_FAILED");

  return ok({ path: targetPath, merged, created, fallbackUsed });
}

function parseAddressesFile(source: string): AddressesShape | null {
  // Look for the exported `addresses` object literal. Handle both
  //   export const addresses = { ... } as const;
  // and
  //   export const addresses = { ... };
  const m = source.match(/export\s+const\s+addresses\s*=\s*(\{[\s\S]*?\})\s*(?:as\s+const)?\s*;?/);
  if (!m) return null;
  let body = m[1];
  // Normalize: numeric chainId keys → string keys for JSON; quote unquoted
  // identifier keys; convert single quotes to double.
  body = body
    .replace(/(\b\d+\b)\s*:/g, '"$1":')                    // 11155111: → "11155111":
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":') // ContractName: → "ContractName":
    .replace(/'([^'\\]*)'/g, '"$1"')                        // 'val' → "val"
    .replace(/,(\s*[}\]])/g, "$1");                         // trailing commas
  try {
    const parsed = JSON.parse(body) as Record<string, Record<string, string>>;
    const out: AddressesShape = {};
    for (const [chainKey, mapping] of Object.entries(parsed)) {
      const chainId = parseInt(chainKey, 10);
      if (!Number.isFinite(chainId)) continue;
      if (typeof mapping !== "object" || mapping === null) continue;
      out[chainId] = {};
      for (const [name, addr] of Object.entries(mapping)) {
        if (typeof addr === "string") out[chainId][name] = addr;
      }
    }
    return out;
  } catch {
    return null;
  }
}

function renderAddressesFile(merged: AddressesShape): string {
  const HEADER =
    "// Auto-generated by the integration agent. Do not edit by hand —\n" +
    "// regenerating will overwrite manual changes.\n";
  return `${HEADER}export const addresses = ${JSON.stringify(merged, null, 2)} as const;\n`;
}

// ── list_broadcasts ─────────────────────────────────────────────────────────
export interface BroadcastRun {
  scriptName: string;
  chainId: number;
  runFile: string;
  deployedContracts: Array<{ name: string; address: string }>;
}

export async function listBroadcasts(
  sandboxId: string,
): Promise<Result<{ runs: BroadcastRun[] }>> {
  // Walk via globFiles first; fallback to find for nested layouts.
  const glob = await globFiles(sandboxId, {
    pattern: `${CONTRACTS_DIR}/broadcast/*/*/run-latest.json`,
  });

  const candidates = new Set<string>();
  if (glob.ok) for (const m of glob.data.matches) candidates.add(m);

  const findR = await bash(
    sandboxId,
    `find ${CONTRACTS_DIR}/broadcast -name 'run-latest.json' -type f 2>/dev/null || true`,
  );
  if (findR.ok) {
    for (const line of findR.data.stdout.split("\n").map((s) => s.trim()).filter(Boolean)) {
      candidates.add(line);
    }
  }

  if (candidates.size === 0) {
    return ok({ runs: [] });
  }

  const runs: BroadcastRun[] = [];
  for (const runFile of candidates) {
    // Path shape: /workspace/contracts/broadcast/<scriptName>/<chainId>/run-latest.json
    const parts = runFile.split("/");
    const file = parts[parts.length - 1];
    const chainStr = parts[parts.length - 2];
    const scriptName = parts[parts.length - 3];
    const chainId = parseInt(chainStr ?? "", 10);
    if (file !== "run-latest.json" || !Number.isFinite(chainId) || !scriptName) continue;

    const r = await readFile(sandboxId, { path: runFile });
    if (!r.ok) continue;
    let parsed: {
      transactions?: Array<{ transactionType?: string; contractName?: string; contractAddress?: string }>;
    };
    try {
      parsed = JSON.parse(r.data.content) as typeof parsed;
    } catch {
      continue;
    }
    const deployedContracts: Array<{ name: string; address: string }> = [];
    for (const tx of parsed.transactions ?? []) {
      if (tx.transactionType === "CREATE" && tx.contractName && tx.contractAddress) {
        deployedContracts.push({ name: tx.contractName, address: tx.contractAddress });
      }
    }
    runs.push({ scriptName, chainId, runFile, deployedContracts });
  }

  return ok({ runs });
}

// ── helpers ─────────────────────────────────────────────────────────────────
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
