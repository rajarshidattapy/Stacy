// Session registry. Lazily spawns one sandbox + agent per user on first chat.
// Mirrors the Python service.py SessionRegistry with async primitives.
import { Client, type Sandbox } from "forgevm";
import {
  buildAgentWithRouting,
  type AgentLike,
  type BuildAgentOptions,
} from "./agent.ts";
import { CostTracker } from "./cost.ts";

const FORGEVM_URL = process.env.FORGEVM_URL ?? "http://localhost:7423";
const FORGEVM_API_KEY = process.env.FORGEVM_API_KEY || undefined;
const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE ?? "forge-nextjs-sandbox:latest";
const SANDBOX_TTL = process.env.SANDBOX_TTL ?? "12m";
const MAX_CONCURRENT_SPAWNS = parseInt(process.env.SERVICE_MAX_SPAWN_CONCURRENCY ?? "20", 10);
const IDLE_TIMEOUT_MS = parseInt(process.env.SERVICE_IDLE_SEC ?? "600", 10) * 1000;

// Simple async mutex: one active lock per user session prevents concurrent agent calls.
class Mutex {
  private _locked = false;
  private readonly _queue: Array<() => void> = [];

  async lock(): Promise<() => void> {
    if (!this._locked) {
      this._locked = true;
      return () => this._release();
    }
    return new Promise((resolve) => {
      this._queue.push(() => resolve(() => this._release()));
    });
  }

  private _release(): void {
    const next = this._queue.shift();
    if (next) next();
    else this._locked = false;
  }
}

export interface Session {
  userId: string;
  client: Client;
  sandbox: Sandbox;
  agent: AgentLike | null;
  costTracker: CostTracker;
  mutex: Mutex;
  createdAt: number;
  lastUsed: number;
  chatCount: number;
}

export class SessionRegistry {
  private readonly sessions = new Map<string, Session>();
  private readonly inProgress = new Map<string, Promise<Session>>();
  private activeSpawns = 0;

  async getOrCreate(userId: string, agentOptions?: BuildAgentOptions): Promise<Session> {
    const existing = this.sessions.get(userId);
    if (existing) {
      existing.lastUsed = Date.now();
      return existing;
    }
    const pending = this.inProgress.get(userId);
    if (pending) return pending;

    const promise = this._spawn(userId, agentOptions).finally(() => {
      this.inProgress.delete(userId);
    });
    this.inProgress.set(userId, promise);
    return promise;
  }

  private async _spawn(userId: string, agentOptions?: BuildAgentOptions): Promise<Session> {
    // Rate-limit concurrent sandbox spawns to protect the host.
    while (this.activeSpawns >= MAX_CONCURRENT_SPAWNS) {
      await new Promise((r) => setTimeout(r, 100));
    }
    this.activeSpawns++;
    try {
      const t0 = performance.now();
      const client = new Client({
        baseUrl: FORGEVM_URL,
        apiKey: FORGEVM_API_KEY,
        userId,
        timeout: 120_000,
      });
      const sandbox = await client.spawn({ image: SANDBOX_IMAGE, ttl: SANDBOX_TTL });
      const spawnMs = Math.round(performance.now() - t0);

      const noLlm = process.env.SERVICE_NO_LLM === "1";
      const agent = noLlm ? null : buildAgentWithRouting(sandbox, { userId, ...agentOptions });

      const sess: Session = {
        userId,
        client,
        sandbox,
        agent,
        costTracker: new CostTracker(),
        mutex: new Mutex(),
        createdAt: Date.now(),
        lastUsed: Date.now(),
        chatCount: 0,
      };

      // Race check: another promise may have won the spawn race.
      const race = this.sessions.get(userId);
      if (race) {
        await sandbox.destroy().catch(() => {});
        return race;
      }

      this.sessions.set(userId, sess);
      console.log(`[session] spawned user=${userId} sandbox=${sandbox.id} spawn_ms=${spawnMs} no_llm=${noLlm}`);
      return sess;
    } finally {
      this.activeSpawns--;
    }
  }

  get(userId: string): Session | undefined {
    return this.sessions.get(userId);
  }

  list(): Session[] {
    return [...this.sessions.values()];
  }

  async drop(userId: string): Promise<boolean> {
    const sess = this.sessions.get(userId);
    if (!sess) return false;
    this.sessions.delete(userId);
    await this._destroy(sess);
    return true;
  }

  private async _destroy(sess: Session): Promise<void> {
    try {
      await sess.sandbox.destroy();
    } catch (err) {
      console.warn(`[session] destroy failed user=${sess.userId}`, err);
    }
  }

  async reapIdle(): Promise<number> {
    const now = Date.now();
    const evict: Session[] = [];
    for (const [uid, sess] of this.sessions) {
      if (now - sess.lastUsed > IDLE_TIMEOUT_MS) {
        this.sessions.delete(uid);
        evict.push(sess);
      }
    }
    await Promise.all(evict.map((s) => this._destroy(s)));
    if (evict.length) console.log(`[session] reaped ${evict.length} idle sessions`);
    return evict.length;
  }

  async destroyAll(): Promise<void> {
    const all = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.all(all.map((s) => this._destroy(s)));
  }
}
