// Gates 0.2-0.4: exercise the tool primitives (filesystem, bash, pathScope)
// against a real sandbox. Verifies:
//   - happy paths return { ok: true, ... }
//   - error paths return { ok: false, error, code } (no throw)
//   - pathScope wrapper rejects out-of-scope paths
import { getStacyClient, dropSandboxCache } from "../src/tools/stacyvmClient.ts";
import { readFile, writeFile, listDir, deleteFile, moveFile, statFile } from "../src/tools/filesystem.ts";
import { bash, bashStream } from "../src/tools/bash.ts";
import { scopeTo, isPathAllowed } from "../src/tools/pathScope.ts";

let pass = 0;
let fail = 0;

function check(label: string, cond: boolean, detail?: unknown): void {
  if (cond) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label} ${detail !== undefined ? JSON.stringify(detail) : ""}`);
    fail++;
  }
}

async function main(): Promise<void> {
  const client = getStacyClient();
  const image = process.env.SANDBOX_IMAGE;
  console.log(`[test-tools] spawning image=${image}`);
  const sb = await client.spawn({ image, ttl: "5m" });
  console.log(`[test-tools] sandbox=${sb.id}`);

  try {
    // ── filesystem.ts ────────────────────────────────────────────────────
    console.log("\n[filesystem]");
    {
      const r = await writeFile(sb.id, { path: "/tmp/a.txt", content: "hello" });
      check("writeFile happy path", r.ok && r.data.bytes === 5, r);
    }
    {
      const r = await readFile(sb.id, { path: "/tmp/a.txt" });
      check("readFile happy path", r.ok && r.data.content === "hello", r);
    }
    {
      const r = await readFile(sb.id, { path: "/tmp/does-not-exist-xyz.txt" });
      check("readFile error path returns Result, no throw", !r.ok && typeof r.error === "string", r);
    }
    {
      const r = await listDir(sb.id, { path: "/tmp" });
      check("listDir happy path", r.ok && Array.isArray(r.data.entries), r);
    }
    {
      const r = await statFile(sb.id, { path: "/tmp/a.txt" });
      check("statFile happy path", r.ok, r);
    }
    {
      const r = await moveFile(sb.id, { from: "/tmp/a.txt", to: "/tmp/b.txt" });
      check("moveFile happy path", r.ok, r);
    }
    {
      const r = await deleteFile(sb.id, { path: "/tmp/b.txt" });
      check("deleteFile happy path", r.ok, r);
    }

    // ── bash.ts ──────────────────────────────────────────────────────────
    console.log("\n[bash]");
    {
      const r = await bash(sb.id, "echo hi && pwd");
      check("bash echo+pwd", r.ok && r.data.exitCode === 0 && r.data.stdout.includes("hi"), r);
    }
    {
      const r = await bash(sb.id, "exit 7");
      check("bash non-zero exit captured", r.ok && r.data.exitCode === 7, r);
    }
    {
      const chunks: string[] = [];
      for await (const c of bashStream(sb.id, "echo line1; sleep 1; echo line2")) {
        chunks.push(c.chunk);
      }
      const joined = chunks.join("");
      check(
        "bashStream yielded 'line1' and 'line2'",
        joined.includes("line1") && joined.includes("line2"),
        joined,
      );
    }

    // ── pathScope.ts ─────────────────────────────────────────────────────
    console.log("\n[pathScope]");
    {
      check("isPathAllowed accepts in-scope", isPathAllowed("/workspace/foo/x.txt", ["/workspace/foo"]));
      check("isPathAllowed rejects out-of-scope", !isPathAllowed("/workspace/bar/x.txt", ["/workspace/foo"]));
      check(
        "isPathAllowed rejects '..' escape",
        !isPathAllowed("/workspace/foo/../bar/x.txt", ["/workspace/foo"]),
      );
    }
    {
      const scopedWrite = scopeTo(["/tmp/scoped"])(writeFile);
      // First create the directory so an in-scope write would succeed.
      await bash(sb.id, "mkdir -p /tmp/scoped");
      const r1 = await scopedWrite(sb.id, { path: "/tmp/scoped/ok.txt", content: "ok" });
      check("scoped writeFile in-scope succeeds", r1.ok, r1);
      const r2 = await scopedWrite(sb.id, { path: "/tmp/elsewhere/oops.txt", content: "no" });
      check(
        "scoped writeFile out-of-scope returns PATH_OUT_OF_SCOPE",
        !r2.ok && r2.code === "PATH_OUT_OF_SCOPE",
        r2,
      );
      const r3 = await scopedWrite(sb.id, { path: "/tmp/scoped/../elsewhere/oops.txt", content: "no" });
      check(
        "scoped writeFile '..' escape blocked",
        !r3.ok && r3.code === "PATH_OUT_OF_SCOPE",
        r3,
      );
    }
  } finally {
    await sb.destroy();
    dropSandboxCache(sb.id);
    console.log(`\n[test-tools] destroyed ${sb.id}`);
  }

  console.log(`\n[test-tools] ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[test-tools] FAILED:", err);
  process.exit(1);
});
