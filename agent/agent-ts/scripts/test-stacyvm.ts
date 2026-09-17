// Gate 0.1: prove the StacyVM SDK is reachable end-to-end.
//
// Spawns a sandbox, writes /tmp/hello.txt, reads it, runs an exec, destroys.
// Run twice consecutively to confirm no leftover state.
import { getStacyClient } from "../src/tools/stacyvmClient.ts";

async function main(): Promise<void> {
  const client = getStacyClient();
  const image = process.env.SANDBOX_IMAGE;
  console.log(`[test-stacyvm] spawning image=${image}`);
  const sb = await client.spawn({ image, ttl: "5m" });
  console.log(`[test-stacyvm] spawned ${sb.id} state=${sb.state}`);

  try {
    await sb.writeFile("/tmp/hello.txt", "hi from gate 0.1");
    console.log("[test-stacyvm] wrote /tmp/hello.txt");

    const content = await sb.readFile("/tmp/hello.txt");
    console.log(`[test-stacyvm] read back: "${content}"`);

    const result = await sb.exec('echo "hi" && pwd');
    console.log(`[test-stacyvm] exec exit=${result.exit_code} stdout=${JSON.stringify(result.stdout.trim())}`);

    if (content !== "hi from gate 0.1") throw new Error("readFile mismatch");
    if (result.exit_code !== 0) throw new Error("exec failed");
  } finally {
    await sb.destroy();
    console.log(`[test-stacyvm] destroyed ${sb.id}`);
  }
}

main().catch((err) => {
  console.error("[test-stacyvm] FAILED:", err);
  process.exit(1);
});
