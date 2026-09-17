// Bridge between the CLI and an agent instance.
//
// The flow for one turn is:
//
//   1. `openAgentRun` — INSERT an `agent.runs` row and return its UUID. This
//      MUST happen before the agent is constructed so the delegate tool's
//      captured `parentRunId` matches a real `agent.runs.id` (foreign-keyed
//      from `agent.delegations.parent_run_id`).
//   2. caller builds the agent, passing `runId` as `parentRunId`.
//   3. `runAgentTurn` — stream events through the translator + printer.
//   4. `closeAgentRun` — UPDATE the row with status/tokens/error.
//
// Splitting open/close from the streaming function lets the harness build the
// agent in between, with the real run id in hand.
import { HumanMessage } from "@langchain/core/messages";
import { translateLangGraphEvent, type RawLangGraphEvent } from "../streaming/translator.ts";
import { printEvent } from "../streaming/printer.ts";
import { startRun, endRun, type RunStatus } from "../memory/runs.ts";
import type { AgentEvent } from "../streaming/events.ts";

export interface OpenAgentRunArgs {
  agentType: string;
  threadId: string;
  message: string;
  profileName?: string;
}

export async function openAgentRun(args: OpenAgentRunArgs): Promise<{ runId: string }> {
  const run = await startRun({
    threadId: args.threadId,
    agentType: args.agentType,
    inputMessage: args.message,
    modelProfile: args.profileName,
  });
  return { runId: run.id };
}

export interface CloseAgentRunArgs {
  runId: string;
  status: RunStatus;
  tokensInput: number;
  tokensOutput: number;
  error?: string;
}

export async function closeAgentRun(args: CloseAgentRunArgs): Promise<void> {
  await endRun({
    runId: args.runId,
    status: args.status,
    tokensInput: args.tokensInput,
    tokensOutput: args.tokensOutput,
    error: args.error,
  });
}

export interface RunAgentTurnArgs {
  agent: { streamEvents: (input: unknown, opts: unknown) => AsyncIterable<unknown> };
  agentType: string;
  threadId: string;
  runId: string;
  message: string;
  recursionLimit?: number;
}

export interface RunAgentTurnResult {
  status: "success" | "failure";
  tokensInput: number;
  tokensOutput: number;
  error?: string;
}

export async function runAgentTurn(args: RunAgentTurnArgs): Promise<RunAgentTurnResult> {
  printEvent({
    type: "agent_started",
    agent: args.agentType,
    threadId: args.threadId,
    runId: args.runId,
  } satisfies AgentEvent);

  const startedAt = Date.now();
  let tokensIn = 0;
  let tokensOut = 0;
  let status: "success" | "failure" = "success";
  let lastError: string | undefined;

  try {
    const stream = args.agent.streamEvents(
      { messages: [new HumanMessage(args.message)] },
      {
        version: "v2",
        configurable: { thread_id: args.threadId },
        recursionLimit: args.recursionLimit ?? 60,
      },
    );

    for await (const raw of stream) {
      const ev = translateLangGraphEvent(raw as RawLangGraphEvent);
      if (!ev) continue;
      if (ev.type === "thinking_ended") {
        tokensIn += ev.tokensIn ?? 0;
        tokensOut += ev.tokensOut ?? 0;
      }
      printEvent(ev);
    }
  } catch (e) {
    status = "failure";
    lastError = e instanceof Error ? e.message : String(e);
    printEvent({
      type: "error",
      where: "agent.streamEvents",
      message: lastError,
      stack: e instanceof Error ? e.stack : undefined,
    } satisfies AgentEvent);
  }

  const ms = Date.now() - startedAt;
  printEvent({
    type: "agent_ended",
    status,
    totalTokens: tokensIn + tokensOut,
    ms,
  } satisfies AgentEvent);

  return { status, tokensInput: tokensIn, tokensOutput: tokensOut, error: lastError };
}
