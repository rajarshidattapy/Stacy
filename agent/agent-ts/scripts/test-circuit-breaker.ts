// Gate 1.4 — circuit breaker behavior in the subagent runner.
//
// Doesn't need a real LLM or sandbox. We seed agent.delegations with three
// failure rows for a fake (subagent_name, task_signature) pair, then call
// runSubagent with a dummy spec and verify the runner short-circuits to
// status: "circuit_open" without invoking the LLM.
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { runSubagent, taskSignature } from "../src/agents/_runtime/subagentRunner.ts";
import { startRun } from "../src/memory/runs.ts";
import { createThread } from "../src/memory/threads.ts";
import { getPool, closePool } from "../src/memory/db.ts";
import type { SubagentSpec } from "../src/agents/_runtime/types.ts";

let pass = 0, fail = 0;
function check(label: string, cond: boolean, detail?: unknown): void {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else { console.log(`  ✗ ${label} ${detail !== undefined ? JSON.stringify(detail).slice(0, 400) : ""}`); fail++; }
}

const dummySpec: SubagentSpec = {
  name: "test-dummy",
  description: "circuit-breaker test fixture",
  systemPrompt: "you should never run because the circuit breaker should fire",
  buildTools: () => [
    tool(async () => "n/a", { name: "noop", description: "noop", schema: z.object({}) }),
  ],
  profile: "cheap",
  maxLLMCalls: 1,
};

async function seedFailures(subagentName: string, signature: string, parentRunId: string, n: number): Promise<void> {
  const result = JSON.stringify({ status: "failure", summary: "seeded failure" });
  for (let i = 0; i < n; i++) {
    await getPool().query(
      `INSERT INTO agent.delegations
        (parent_run_id, child_subagent_name, task_description, task_signature, result, duration_ms)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [parentRunId, subagentName, `seeded failure ${i}`, signature, result, 0],
    );
  }
}

async function main(): Promise<void> {
  console.log("[test-circuit-breaker] setting up thread + parent run row");
  const thread = await createThread({ agentType: "smart-contract" });
  const parent = await startRun({ threadId: thread.id, agentType: "smart-contract", inputMessage: "test" });
  const taskDescription = "compile the project and report all warnings (test fixture)";
  const sig = taskSignature(taskDescription);

  // 1. Empty state → no circuit. We won't actually run the agent (no LLM key
  //    needed) — so we only test the < 3 failures path indirectly by checking
  //    the seed→fire path.
  await seedFailures(dummySpec.name, sig, parent.id, 3);

  console.log("[test-circuit-breaker] invoking runSubagent with circuit pre-tripped");
  const result = await runSubagent({
    spec: dummySpec,
    taskDescription,
    parentRunId: parent.id,
    sandboxId: "sb-fake-not-used",
    threadId: thread.id,
  });

  check("status === circuit_open", result.status === "circuit_open", result.status);
  check("attempts populated with 3 prior failures", Array.isArray(result.attempts) && result.attempts.length === 3, result.attempts?.length);
  check("subagentName recorded", result.subagentName === dummySpec.name, result.subagentName);

  // Cleanup seeded rows (cascades from parent run / thread).
  await getPool().query(`DELETE FROM agent.runs WHERE id = $1`, [parent.id]);
  await getPool().query(`DELETE FROM agent.threads WHERE id = $1`, [thread.id]);

  await closePool();

  console.log(`\n[test-circuit-breaker] ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[test-circuit-breaker] FAILED:", err);
  closePool().finally(() => process.exit(1));
});
