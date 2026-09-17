// Gate 0.5b: verify checkpointer setup ran and our agent.* tables work.
//
// We don't manually round-trip through PostgresSaver.put here — its internal
// API takes 4 args (config, checkpoint, metadata, newVersions) and is meant
// to be driven by LangGraph itself. The real round-trip gate happens in
// Phase 1 when the SC agent's first turn checkpoints and resumes. For Phase
// 0 we settle for: setup() succeeded, the langgraph checkpoint tables exist,
// and our own agent.threads CRUD works.
import { getCheckpointer } from "../src/memory/checkpointer.ts";
import { closePool, getPool } from "../src/memory/db.ts";
import { createThread, getThread, setThreadStatus } from "../src/memory/threads.ts";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: unknown): void {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else { console.log(`  ✗ ${label} ${detail !== undefined ? JSON.stringify(detail) : ""}`); fail++; }
}

async function main(): Promise<void> {
  console.log("[test-checkpointer] setup");
  const saver = await getCheckpointer();
  check("PostgresSaver instance returned", !!saver);

  // The langgraph checkpointer creates its own tables; verify a couple exist.
  const { rows: tables } = await getPool().query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name LIKE 'checkpoint%'
     ORDER BY table_name`,
  );
  console.log(`  langgraph tables: ${tables.map((t) => t.table_name).join(", ")}`);
  check("langgraph 'checkpoints' table exists", tables.some((t) => t.table_name === "checkpoints"));

  // agent.threads CRUD.
  console.log("\n[test-checkpointer] agent.threads CRUD");
  const t = await createThread({ agentType: "smart-contract", sandboxId: "sb-test" });
  check("createThread", !!t.id);
  const fetched = await getThread(t.id);
  check("getThread returns row", !!fetched && fetched.agent_type === "smart-contract", fetched);
  await setThreadStatus(t.id, "idle");
  const fetched2 = await getThread(t.id);
  check("setThreadStatus → idle", fetched2?.status === "idle", fetched2?.status);

  await getPool().query(`DELETE FROM agent.threads WHERE id = $1`, [t.id]);

  await closePool();

  console.log(`\n[test-checkpointer] ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[test-checkpointer] FAILED:", err);
  closePool().finally(() => process.exit(1));
});
