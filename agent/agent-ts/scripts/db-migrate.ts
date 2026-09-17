// Runs schema.sql against DATABASE_URL. Idempotent — every CREATE uses
// IF NOT EXISTS.
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, getPool } from "../src/memory/db.ts";
import { getCheckpointer } from "../src/memory/checkpointer.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(HERE, "../src/memory/schema.sql");

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  console.log(`[db-migrate] DATABASE_URL=${url.replace(/:[^:@]+@/, ":***@")}`);

  const sql = await readFile(SCHEMA_PATH, "utf8");
  await getPool().query(sql);
  console.log(`[db-migrate] applied schema.sql`);

  // Have PostgresSaver create its own checkpoint tables.
  await getCheckpointer();
  console.log(`[db-migrate] PostgresSaver.setup() done`);

  // Sanity check: list our agent.* tables.
  const { rows } = await getPool().query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'agent' ORDER BY table_name`,
  );
  console.log(`[db-migrate] agent.* tables: ${rows.map((r) => r.table_name).join(", ")}`);

  await closePool();
}

main().catch((err) => {
  console.error("[db-migrate] failed:", err);
  process.exit(1);
});
