// LangGraph PostgresSaver singleton. Set up once per process; reused by every
// agent that needs cross-run memory.
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

let _saver: PostgresSaver | null = null;
let _setupDone = false;

export async function getCheckpointer(): Promise<PostgresSaver> {
  if (_saver) return _saver;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  _saver = PostgresSaver.fromConnString(url);
  if (!_setupDone) {
    await _saver.setup();
    _setupDone = true;
  }
  return _saver;
}
