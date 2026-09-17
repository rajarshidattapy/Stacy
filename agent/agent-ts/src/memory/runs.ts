// agent.runs CRUD. The runner inserts a row when a top-level agent run
// starts and updates it on completion. parent_run_id chains subagent runs
// back to their parent; subagent rows are inserted by the subagent runner
// alongside the agent.delegations row.
import { getPool } from "./db.ts";

export type RunStatus = "running" | "success" | "failure" | "partial";

export interface RunRow {
  id: string;
  thread_id: string;
  agent_type: string;
  parent_run_id: string | null;
  status: RunStatus;
  started_at: Date;
  ended_at: Date | null;
  input_message: string | null;
  final_summary: unknown;
  model_profile: string | null;
  tokens_input: number;
  tokens_output: number;
  error: string | null;
}

export async function startRun(args: {
  threadId: string;
  agentType: string;
  parentRunId?: string | null;
  inputMessage?: string;
  modelProfile?: string;
}): Promise<RunRow> {
  const { rows } = await getPool().query<RunRow>(
    `INSERT INTO agent.runs (thread_id, agent_type, parent_run_id, input_message, model_profile)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      args.threadId,
      args.agentType,
      args.parentRunId ?? null,
      args.inputMessage ?? null,
      args.modelProfile ?? null,
    ],
  );
  return rows[0];
}

export async function endRun(args: {
  runId: string;
  status: RunStatus;
  finalSummary?: unknown;
  tokensInput?: number;
  tokensOutput?: number;
  error?: string;
}): Promise<void> {
  await getPool().query(
    `UPDATE agent.runs
     SET status = $2, ended_at = NOW(),
         final_summary = $3, tokens_input = $4, tokens_output = $5, error = $6
     WHERE id = $1`,
    [
      args.runId,
      args.status,
      args.finalSummary ? JSON.stringify(args.finalSummary) : null,
      args.tokensInput ?? 0,
      args.tokensOutput ?? 0,
      args.error ?? null,
    ],
  );
}
