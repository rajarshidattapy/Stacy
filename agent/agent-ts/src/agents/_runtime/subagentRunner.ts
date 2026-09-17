// Subagent runner with circuit breaker.
//
// 1. Hash the task description into a signature.
// 2. Query agent.delegations for prior failures with the same
//    (subagent_name, task_signature) within the last hour.
// 3. If ≥ 3 failures → return synthetic circuit_open without invoking the LLM.
// 4. Otherwise build a fresh deepagents instance with the spec's tools +
//    system prompt, invoke it with the task description as the user message,
//    parse the final assistant message for a JSON summary block.
// 5. Persist the result to agent.delegations and return.
import { createHash } from "node:crypto";
import { createDeepAgent } from "deepagents";
import { HumanMessage } from "@langchain/core/messages";
import { buildModel } from "../../models/anthropicClient.ts";
import { getPool } from "../../memory/db.ts";
import { buildSkillsBackend, READ_ONLY_SKILLS_PERMISSIONS } from "./skillsBackend.ts";
import type { RunSubagentArgs, SubagentSpec, SubagentSummary } from "./types.ts";

const FAILURE_WINDOW = "1 hour";
const CIRCUIT_THRESHOLD = 3;

export function taskSignature(taskDescription: string): string {
  return createHash("sha256").update(taskDescription).digest("hex").slice(0, 16);
}

async function checkCircuit(
  subagentName: string,
  signature: string,
): Promise<SubagentSummary[]> {
  const { rows } = await getPool().query<{ result: SubagentSummary }>(
    `SELECT result
     FROM agent.delegations
     WHERE child_subagent_name = $1
       AND task_signature = $2
       AND result->>'status' = 'failure'
       AND created_at > NOW() - INTERVAL '${FAILURE_WINDOW}'
     ORDER BY created_at DESC
     LIMIT $3`,
    [subagentName, signature, CIRCUIT_THRESHOLD],
  );
  return rows.map((r) => r.result);
}

async function persistDelegation(args: {
  parentRunId: string;
  subagentName: string;
  taskDescription: string;
  signature: string;
  result: SubagentSummary;
  durationMs: number;
}): Promise<void> {
  await getPool().query(
    `INSERT INTO agent.delegations
       (parent_run_id, child_subagent_name, task_description, task_signature, result, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      args.parentRunId,
      args.subagentName,
      args.taskDescription,
      args.signature,
      JSON.stringify(args.result),
      args.durationMs,
    ],
  );
}

// Look at the final agent message and try to extract a JSON object of the
// expected shape. We accept either a fenced ```json block or a bare object
// at the end of the text.
function parseSummary(text: string): SubagentSummary | null {
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced) {
    try {
      const obj = JSON.parse(fenced[1]) as SubagentSummary;
      if (obj && typeof obj.status === "string" && typeof obj.summary === "string") return obj;
    } catch { /* fall through */ }
  }
  // Fallback: last balanced { ... } block.
  const lastBrace = text.lastIndexOf("{");
  if (lastBrace >= 0) {
    const candidate = text.slice(lastBrace);
    try {
      const obj = JSON.parse(candidate) as SubagentSummary;
      if (obj && typeof obj.status === "string" && typeof obj.summary === "string") return obj;
    } catch { /* nope */ }
  }
  return null;
}

const SUMMARY_INSTRUCTION = `

When you finish, end your final message with a single fenced JSON block of the form:

\`\`\`json
{
  "status": "success" | "failure" | "partial",
  "summary": "<one-paragraph plain-English summary>",
  "artifacts": { ... task-specific keys ... },
  "nextSteps": ["...", "..."]
}
\`\`\`

The orchestrator parses this block. If you can't determine an artifact value, omit the key — don't put a placeholder string. If the task could not be completed at all, set status to "failure".`;

export async function buildSubagentSystemPrompt(spec: SubagentSpec, sandboxId: string, context?: unknown): Promise<string> {
  const base = typeof spec.systemPrompt === "function" ? await spec.systemPrompt(sandboxId, context) : spec.systemPrompt;
  return `${base.trim()}\n${SUMMARY_INSTRUCTION}`;
}

export async function runSubagent(args: RunSubagentArgs): Promise<SubagentSummary> {
  const startedAt = Date.now();
  const sig = taskSignature(args.taskDescription);

  // ── circuit breaker ─────────────────────────────────────────────────────
  const priorFailures = await checkCircuit(args.spec.name, sig);
  if (priorFailures.length >= CIRCUIT_THRESHOLD) {
    const summary: SubagentSummary = {
      status: "circuit_open",
      summary: `Circuit breaker open for ${args.spec.name}: ${priorFailures.length} prior failures with the same task signature in the last ${FAILURE_WINDOW}. Not retrying.`,
      attempts: priorFailures,
      subagentName: args.spec.name,
      durationMs: 0,
    };
    await persistDelegation({
      parentRunId: args.parentRunId,
      subagentName: args.spec.name,
      taskDescription: args.taskDescription,
      signature: sig,
      result: summary,
      durationMs: 0,
    });
    return summary;
  }

  // ── build & invoke ──────────────────────────────────────────────────────
  const tools = args.spec.buildTools(args.sandboxId, args.parentRunId, args.threadId);
  const model = buildModel(args.spec.profile);

  const agent = createDeepAgent({
    model,
    tools,
    systemPrompt: await buildSubagentSystemPrompt(args.spec, args.sandboxId, args.contextBundle),
    // Same skills backend as parent — subagents share read-only access to the
    // /skills/ tree via the deepagents built-in tools. Sandbox files are
    // reached through the spec's `sandbox_*` tools.
    backend: buildSkillsBackend(),
    permissions: READ_ONLY_SKILLS_PERMISSIONS,
  });

  const userText = args.contextBundle
    ? `${args.taskDescription}\n\n## Context bundle\n\n\`\`\`json\n${JSON.stringify(args.contextBundle, null, 2)}\n\`\`\``
    : args.taskDescription;

  // Fix A: multiply by 3 (not 2) — deepagents always includes todoListMiddleware
  // which adds write_todos tool calls as extra graph nodes on top of the standard
  // model+tools pair. Under-counting causes recursion limit to fire on the happy path.
  const recursionLimit = (args.spec.maxLLMCalls ?? 12) * 3;
  const threadConfig = {
    recursionLimit,
    configurable: { thread_id: `${args.threadId}:${args.spec.name}:${sig}` },
  };

  // Stream rather than invoke so we hold the latest message state even if the
  // graph throws a recursion-limit error after the subagent's final message.
  // The langchain ReactAgent's `.stream(...)` returns a Promise<IterableReadableStream>,
  // so it must be awaited before iterating.
  type AnyMessage = { _getType?: () => string; content?: unknown };
  let lastMessages: AnyMessage[] = [];
  let summary: SubagentSummary;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = await (agent as any).stream(
      { messages: [new HumanMessage(userText)] },
      { ...threadConfig, streamMode: "values" },
    );
    for await (const state of stream as AsyncIterable<{ messages?: AnyMessage[] }>) {
      if (Array.isArray(state.messages)) lastMessages = state.messages;
    }
    const last = [...lastMessages].reverse().find((m) => m._getType?.() === "ai");
    const finalText = extractText(last?.content);
    const parsed = parseSummary(finalText);
    if (parsed) {
      summary = parsed;
    } else {
      // Subagent finished cleanly but didn't produce a parseable JSON block.
      // That's an orchestration shape failure, not an operation failure — the
      // work may or may not have happened, so retry is unsafe.
      summary = {
        status: "partial",
        summary: `Subagent did not return a valid JSON summary. Raw last message: ${finalText.slice(0, 800)}`,
        subagentName: args.spec.name,
        failureKind: "orchestration",
      };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isRecursionLimit = /recursion limit/i.test(msg);
    if (isRecursionLimit && lastMessages.length > 0) {
      // Orchestration framework ran out of steps, but the subagent may have
      // already completed its work. Try to recover from the last streamed state.
      const last = [...lastMessages].reverse().find((m) => m._getType?.() === "ai");
      const finalText = extractText(last?.content);
      const recovered = parseSummary(finalText);
      if (recovered) {
        summary = { ...recovered, subagentName: args.spec.name };
      } else {
        summary = {
          status: "failure",
          summary: `Recursion limit hit; no valid JSON summary found in last subagent message. The intended operation may have already completed — verify on-chain / on-disk state before retrying. Raw: ${finalText.slice(0, 800)}`,
          subagentName: args.spec.name,
          failureKind: "orchestration",
        };
      }
    } else {
      // Any other throw: runtime / network / type error inside the orchestration
      // layer. Treat as orchestration failure so the parent verifies state.
      summary = {
        status: "failure",
        summary: `Subagent runner threw before completion: ${msg}. The intended operation may have partially executed — verify on-chain / on-disk state before retrying.`,
        subagentName: args.spec.name,
        failureKind: "orchestration",
      };
    }
  }

  summary.subagentName = args.spec.name;
  summary.durationMs = Date.now() - startedAt;

  await persistDelegation({
    parentRunId: args.parentRunId,
    subagentName: args.spec.name,
    taskDescription: args.taskDescription,
    signature: sig,
    result: summary,
    durationMs: summary.durationMs,
  });

  return summary;
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        const blk = b as { type?: string; text?: string };
        return blk.type === "text" && typeof blk.text === "string" ? blk.text : "";
      })
      .join("");
  }
  return "";
}
