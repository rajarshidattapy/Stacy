// Thread + run lifecycle helpers. These are CRUD over agent.threads /
// agent.runs and are kept thin — the agents themselves call them at the right
// moments.
import { getPool } from "./db.ts";

export type ThreadStatus = "active" | "idle" | "archived";
export type RunStatus = "running" | "success" | "failure" | "partial";

export interface ThreadRow {
  id: string;
  agent_type: string;
  status: ThreadStatus;
  sandbox_id: string | null;
  created_at: Date;
  updated_at: Date;
  total_tokens_used: number;
  total_runs: number;
}

export async function createThread(args: {
  agentType: string;
  sandboxId?: string | null;
  userId?: string | null;
  projectId?: string | null;
}): Promise<ThreadRow> {
  const { rows } = await getPool().query<ThreadRow>(
    `INSERT INTO agent.threads (agent_type, sandbox_id, user_id, project_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [args.agentType, args.sandboxId ?? null, args.userId ?? null, args.projectId ?? null],
  );
  return rows[0];
}

export async function getThread(id: string): Promise<ThreadRow | null> {
  const { rows } = await getPool().query<ThreadRow>(
    `SELECT * FROM agent.threads WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function setThreadStatus(id: string, status: ThreadStatus): Promise<void> {
  await getPool().query(
    `UPDATE agent.threads SET status = $1, updated_at = NOW() WHERE id = $2`,
    [status, id],
  );
}

export async function touchThread(id: string): Promise<void> {
  await getPool().query(
    `UPDATE agent.threads SET updated_at = NOW(), total_runs = total_runs + 1 WHERE id = $1`,
    [id],
  );
}
