// Gate 1.1: exercise the forge tool wrappers against a real evm-image sandbox.
//
// Required:  STACYVM_URL pointing at a live orchestrator, SANDBOX_IMAGE set.
// Optional:  SEPOLIA_RPC_URL + SEPOLIA_PRIVATE_KEY → enables the deploy steps.
//            Without them, deploy/read_deployed_address are skipped.
import { getStacyClient, dropSandboxCache } from "../src/tools/stacyvmClient.ts";
import {
  forgeBuild,
  forgeTest,
  forgeFmt,
  forgeInspectAbi,
  extractAbi,
  readDeployedAddress,
  forgeDeploySepolia,
  listContracts,
  slitherAudit,
} from "../src/tools/forge.ts";
import { writeFile, readFile } from "../src/tools/filesystem.ts";

let pass = 0, fail = 0;
function check(label: string, cond: boolean, detail?: unknown): void {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else { console.log(`  ✗ ${label} ${detail !== undefined ? JSON.stringify(detail).slice(0, 400) : ""}`); fail++; }
}

async function main(): Promise<void> {
  const client = getStacyClient();
  const image = process.env.SANDBOX_IMAGE;
  console.log(`[test-forge] spawning image=${image}`);
  const sb = await client.spawn({ image, ttl: "20m" });
  console.log(`[test-forge] sandbox=${sb.id}`);

  try {
    console.log("\n[forge_build]");
    const build = await forgeBuild(sb.id);
    check("forge_build returns Result", build.ok, build);
    check("forge_build success on default project", build.ok && build.data.success, build);

    console.log("\n[list_contracts]");
    const list = await listContracts(sb.id);
    check("list_contracts returns at least one contract", list.ok && list.data.contracts.length > 0, list);
    const counter = list.ok ? list.data.contracts.find((c) => c.contractName === "Counter") : undefined;
    check("found Counter contract", !!counter, counter);

    console.log("\n[forge_test]");
    const t = await forgeTest(sb.id, { verbosity: 2 });
    check("forge_test runs", t.ok, t);

    console.log("\n[forge_fmt]");
    const fmt = await forgeFmt(sb.id);
    check("forge_fmt returns ok", fmt.ok, fmt);

    console.log("\n[forge_inspect_abi]");
    const abi = await forgeInspectAbi(sb.id, { contractName: "Counter" });
    check("forge_inspect_abi returns parsed JSON", abi.ok && Array.isArray((abi.data.abi as unknown[])), abi);

    console.log("\n[extract_abi]");
    const ex = await extractAbi(sb.id, { contractFile: "Counter.sol", contractName: "Counter" });
    check("extract_abi succeeds", ex.ok, ex);
    if (ex.ok) {
      const back = await readFile(sb.id, { path: ex.data.abiPath });
      check("ABI file is valid JSON", back.ok && JSON.parse(back.data.content).length > 0, back);
    }

    // ── slither (optional — depends on whether the image has it) ───────────
    console.log("\n[slither_audit]");
    const sl = await slitherAudit(sb.id);
    if (sl.ok) check("slither_audit ran", true);
    else console.log(`  · slither not available (skipping): ${sl.error.slice(0, 200)}`);

    // ── deploy + read address (optional, requires Sepolia secrets) ─────────
    const rpc = process.env.SEPOLIA_RPC_URL;
    const pk = process.env.SEPOLIA_PRIVATE_KEY;
    if (rpc && pk) {
      console.log("\n[forge_deploy_sepolia + read_deployed_address]");
      const env = `RPC_URL=${rpc}\nPRIVATE_KEY=${pk}\n`;
      const w = await writeFile(sb.id, { path: "/workspace/contracts/.env", content: env });
      check(".env written", w.ok, w);
      const dep = await forgeDeploySepolia(sb.id, { scriptPath: "script/Counter.s.sol" });
      check("forge_deploy_sepolia success", dep.ok && dep.data.success, dep);
      if (dep.ok && dep.data.success) {
        const addr = await readDeployedAddress(sb.id, { contractName: "Counter" });
        check("read_deployed_address returns address", addr.ok && /^0x[0-9a-fA-F]{40}$/.test(addr.data.address ?? ""), addr);
      }
    } else {
      console.log("\n[deploy steps] skipped — set SEPOLIA_RPC_URL + SEPOLIA_PRIVATE_KEY to enable");
    }
  } finally {
    await sb.destroy();
    dropSandboxCache(sb.id);
    console.log(`\n[test-forge] destroyed ${sb.id}`);
  }

  console.log(`\n[test-forge] ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[test-forge] FAILED:", err);
  process.exit(1);
});
