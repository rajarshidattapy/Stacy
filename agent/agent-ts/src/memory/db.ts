// Singleton pg Pool. Used by checkpointer setup, db-migrate, and any direct
// SQL we run against agent.* tables.
import { Pool } from "pg";

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  _pool = new Pool({ connectionString: url, max: 10 });
  return _pool;
}

export async function closePool(): Promise<void> {
  if (_pool) {
    const p = _pool;
    _pool = null;
    await p.end();
  }
}
