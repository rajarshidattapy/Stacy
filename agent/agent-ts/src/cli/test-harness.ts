// Interactive CLI test harness.
//
//   * sandbox spawn / attach / cleanup via the StacyVM SDK
//   * thread create / resume in Postgres
//   * readline loop that runs one agent turn per line, rendered by the
//     canonical event printer
//
// The HTTP server (src/server) runs the same agents for the IDE frontend.
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { Sandbox } from "stacyvm";
import { parseArgs, printHelp } from "./args.ts";
import { getStacyClient, cacheSandbox, dropSandboxCache } from "../tools/stacyvmClient.ts";
import { closePool } from "../memory/db.ts";
import { createThread, getThread, setThreadStatus, touchThread } from "../memory/threads.ts";
import { openAgentRun, runAgentTurn, closeAgentRun } from "./runAgent.ts";
import { buildAgent, SANDBOXLESS_AGENTS } from "../agents/registry.ts";

const GREY = "\x1b[90m";
const B = "\x1b[1m";
const BLUE = "\x1b[34m";
const R = "\x1b[0m";

async function provisionSandbox(args: ReturnType<typeof parseArgs>): Promise<Sandbox | null> {
  if (args.noSandbox) return null;
  const client = getStacyClient();

  if (args.sandbox) {
    const sb = await client.get(args.sandbox);
    cacheSandbox(sb);
    console.log(`${BLUE}[harness] attached to sandbox=${sb.id} state=${sb.state}${R}`);
    return sb;
  }
  if (args.newSandbox) {
    const image = args.template ?? process.env.SANDBOX_IMAGE;
    const ttl = process.env.SANDBOX_TTL ?? "30m";
    console.log(`${BLUE}[harness] spawning sandbox image=${image} ttl=${ttl}…${R}`);
    const sb = await client.spawn({ image, ttl });
    cacheSandbox(sb);
    console.log(`${BLUE}[harness] sandbox ready: ${sb.id}${R}`);
    return sb;
  }

  console.log(`${GREY}[harness] no --sandbox / --new-sandbox / --no-sandbox provided; running without a sandbox${R}`);
  return null;
}

async function injectPrd(sandbox: Sandbox, prdPath: string): Promise<void> {
  const content = await readFile(prdPath, "utf8");
  await sandbox.writeFile("/workspace/PRD.md", content);
  console.log(`${BLUE}[harness] wrote ${content.length} bytes to /workspace/PRD.md${R}`);
}

async function provisionThread(args: ReturnType<typeof parseArgs>, sandboxId: string | null): Promise<{ id: string; isNew: boolean }> {
  if (args.thread) {
    const existing = await getThread(args.thread);
    if (!existing) throw new Error(`thread ${args.thread} not found`);
    await touchThread(existing.id);
    console.log(`${BLUE}[harness] resumed thread ${existing.id} (status=${existing.status})${R}`);
    return { id: existing.id, isNew: false };
  }
  const agentType = args.agent ?? "shell";
  const row = await createThread({ agentType, sandboxId });
  console.log(`${BLUE}[harness] new thread ${row.id} (agent=${agentType})${R}`);
  return { id: row.id, isNew: true };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    printHelp();
    process.exit(0);
  }
  const args = parseArgs(argv);

  const sandbox = await provisionSandbox(args);
  const spawnedHere = args.newSandbox && sandbox !== null;

  if (sandbox && args.prdPath) {
    await injectPrd(sandbox, args.prdPath);
  }

  const thread = await provisionThread(args, sandbox?.id ?? null);

  console.log(`${B}${BLUE}\n[harness] ready. type a message; Ctrl+C to exit.${R}\n`);

  const rl = createInterface({ input, output, terminal: true });
  rl.setPrompt("> ");

  const cleanup = async () => {
    rl.close();
    await setThreadStatus(thread.id, "idle").catch(() => {});
    if (sandbox && spawnedHere && !args.keep) {
      console.log(`${GREY}[harness] destroying sandbox ${sandbox.id}…${R}`);
      await sandbox.destroy().catch((err: unknown) => console.warn("[cleanup]", err));
      dropSandboxCache(sandbox.id);
    } else if (sandbox) {
      console.log(`${GREY}[harness] sandbox left alive: ${sandbox.id}${R}`);
    }
    await closePool();
  };

  let interrupted = false;
  rl.on("SIGINT", () => {
    if (interrupted) process.exit(130);
    interrupted = true;
    console.log(`\n${GREY}[harness] received SIGINT, cleaning up… (press Ctrl+C again to force quit)${R}`);
    cleanup().finally(() => process.exit(0));
  });

  // ── Wire the requested agent ───────────────────────────────────────────
  const agentName = args.agent;
  if (agentName && !sandbox && !SANDBOXLESS_AGENTS.has(agentName)) {
    throw new Error(`${agentName} agent requires a sandbox`);
  }

  rl.prompt();
  for await (const line of rl) {
    const text = line.trim();
    if (!text) {
      rl.prompt();
      continue;
    }

    if (!agentName) {
      console.log(`${GREY}[harness] no --agent given; you said: ${text}${R}`);
      rl.prompt();
      continue;
    }

    // Open the run row first so its UUID exists for the delegate tool's
    // captured parentRunId — agent.delegations.parent_run_id is FK to
    // agent.runs(id) and would fail otherwise.
    const agentType = agentName;
    const { runId } = await openAgentRun({
      agentType,
      threadId: thread.id,
      message: text,
    });

    let result: Awaited<ReturnType<typeof runAgentTurn>> = {
      status: "failure",
      tokensInput: 0,
      tokensOutput: 0,
      error: undefined,
    };

    try {
      const { agent } = await buildAgent({
        agent: agentName,
        sandboxId: sandbox?.id ?? null,
        threadId: thread.id,
        parentRunId: runId,
        initialUserMessage: text,
        profileOverride: args.profile ?? undefined,
        pauseBetweenPhases: !args.noPause,
      });
      result = await runAgentTurn({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        agent: agent as any,
        agentType,
        threadId: thread.id,
        runId,
        message: text,
        recursionLimit: args.maxTokens ? Math.max(20, Math.min(200, args.maxTokens / 1000)) : 100,
      });
    } catch (e) {
      console.error("[harness] turn failed:", e);
      result.error = e instanceof Error ? e.message : String(e);
    }

    await closeAgentRun({ runId, ...result }).catch((err) =>
      console.warn("[harness] failed to close run row:", err),
    );
    rl.prompt();
  }

  await cleanup();
}

main().catch(async (err) => {
  console.error("[harness] fatal:", err);
  await closePool().catch(() => {});
  process.exit(1);
});
