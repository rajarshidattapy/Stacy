// HTTP + SSE server that exposes StacyVM sandboxes and the agents to the IDE.
//
// Routes (all JSON unless noted):
//   GET    /health
//   POST   /sandboxes                     {image?, ttl?}  -> spawn
//   GET    /sandboxes/:id
//   DELETE /sandboxes/:id
//   POST   /sandboxes/:id/preview         start `next dev` in /workspace/frontend
//   GET    /sandboxes/:id/preview         {ready}
//   GET    /sandboxes/:id/tree            {tree, files}
//   GET    /sandboxes/:id/files?path=     {path, content}
//   PUT    /sandboxes/:id/files           {path, content}
//   DELETE /sandboxes/:id/files?path=
//   POST   /sandboxes/:id/exec            {command, cwd?}
//   POST   /threads                       {agent, sandboxId?} -> {id}
//   POST   /runs                          {threadId, agent, sandboxId?, message, profile?}
//                                         -> text/event-stream of AgentEvent
//
// Run: bun run server
import { getStacyClient, getSandbox, cacheSandbox, dropSandboxCache } from "../tools/stacyvmClient.ts";
import { getPool, closePool } from "../memory/db.ts";
import { createThread, getThread, setThreadStatus, touchThread } from "../memory/threads.ts";
import { openAgentRun, runAgentTurn, closeAgentRun } from "../cli/runAgent.ts";
import { buildAgent, isAgentName, AGENT_NAMES, SANDBOXLESS_AGENTS } from "../agents/registry.ts";
import type { AgentEvent } from "../streaming/events.ts";
import {
  PathError,
  PREVIEW_PORT,
  isPreviewReady,
  listWorkspaceTree,
  startPreview,
  toSandboxPath,
} from "./workspace.ts";

const PORT = parseInt(process.env.AGENT_SERVER_PORT ?? "8787", 10);
const ALLOWED_ORIGINS = (process.env.AGENT_SERVER_CORS_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// One run per thread at a time; the controller lets a new request or a
// client disconnect cancel it.
const activeRuns = new Map<string, AbortController>();

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const allow = origin && (ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin));
  return {
    "Access-Control-Allow-Origin": allow ? origin : ALLOWED_ORIGINS[0] ?? "",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "request body must be JSON");
  }
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, `${name} is required`);
  return value;
}

async function sandboxOr404(id: string) {
  try {
    return await getSandbox(id);
  } catch (e) {
    throw new HttpError(404, `sandbox ${id} not found: ${e instanceof Error ? e.message : e}`);
  }
}

function sandboxView(sb: Awaited<ReturnType<typeof getSandbox>>) {
  return {
    id: sb.id,
    state: sb.info.state,
    previewUrl: sb.getPreviewUrl(PREVIEW_PORT),
    previewPort: PREVIEW_PORT,
  };
}

// ── Handlers ────────────────────────────────────────────────────────────────

async function health(): Promise<Response> {
  const [stacyvm, database] = await Promise.all([
    getStacyClient().health().then(() => true, () => false),
    Promise.resolve().then(() => getPool().query("SELECT 1")).then(() => true, () => false),
  ]);
  return json({ ok: stacyvm && database, stacyvm, database, agents: AGENT_NAMES });
}

async function spawnSandbox(req: Request): Promise<Response> {
  const body = await readJson<{ image?: string; ttl?: string }>(req).catch(() => ({}) as { image?: string; ttl?: string });
  const sb = await getStacyClient().spawn({
    image: body.image ?? process.env.SANDBOX_IMAGE ?? "stacy-evm:latest",
    ttl: body.ttl ?? process.env.SANDBOX_TTL ?? "30m",
  });
  cacheSandbox(sb);
  return json(sandboxView(sb), 201);
}

async function runStream(req: Request): Promise<Response> {
  const body = await readJson<{
    threadId?: string;
    agent?: string;
    sandboxId?: string | null;
    message?: string;
    profile?: string;
  }>(req);
  const threadId = requireString(body.threadId, "threadId");
  const message = requireString(body.message, "message");
  if (!isAgentName(body.agent)) {
    throw new HttpError(400, `agent must be one of: ${AGENT_NAMES.join(", ")}`);
  }
  const agentName = body.agent;
  const sandboxId = body.sandboxId ?? null;
  if (!sandboxId && !SANDBOXLESS_AGENTS.has(agentName)) {
    throw new HttpError(400, `${agentName} agent requires a sandbox`);
  }
  if (!(await getThread(threadId))) throw new HttpError(404, `thread ${threadId} not found`);

  activeRuns.get(threadId)?.abort();
  const controller = new AbortController();
  activeRuns.set(threadId, controller);
  req.signal.addEventListener("abort", () => controller.abort());

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(sink) {
      let closed = false;
      const send = (ev: AgentEvent) => {
        if (closed) return;
        try {
          sink.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        } catch {
          closed = true;
        }
      };
      // Comments keep proxies from closing a quiet stream during long tool calls.
      const keepAlive = setInterval(() => {
        if (!closed) {
          try {
            sink.enqueue(encoder.encode(": keep-alive\n\n"));
          } catch {
            closed = true;
          }
        }
      }, 15_000);

      let runId: string | null = null;
      let result: Awaited<ReturnType<typeof runAgentTurn>> = {
        status: "failure",
        tokensInput: 0,
        tokensOutput: 0,
      };
      try {
        ({ runId } = await openAgentRun({ agentType: agentName, threadId, message }));
        await touchThread(threadId).catch(() => {});
        const { agent } = await buildAgent({
          agent: agentName,
          sandboxId,
          threadId,
          parentRunId: runId,
          initialUserMessage: message,
          profileOverride: body.profile,
        });
        result = await runAgentTurn({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          agent: agent as any,
          agentType: agentName,
          threadId,
          runId,
          message,
          recursionLimit: 100,
          onEvent: send,
          signal: controller.signal,
        });
      } catch (e) {
        result.error = e instanceof Error ? e.message : String(e);
        send({ type: "error", where: "server.run", message: result.error });
        send({ type: "agent_ended", status: "failure" });
      } finally {
        clearInterval(keepAlive);
        if (activeRuns.get(threadId) === controller) activeRuns.delete(threadId);
        if (runId) {
          await closeAgentRun({ runId, ...result }).catch((err) =>
            console.warn("[server] failed to close run row:", err),
          );
        }
        await setThreadStatus(threadId, "idle").catch(() => {});
        if (!closed) {
          closed = true;
          sink.close();
        }
      }
    },
    cancel() {
      controller.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

async function route(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const method = req.method;

  if (parts[0] === "health" && method === "GET") return health();

  if (parts[0] === "threads" && parts.length === 1 && method === "POST") {
    const body = await readJson<{ agent?: string; sandboxId?: string | null }>(req);
    if (!isAgentName(body.agent)) {
      throw new HttpError(400, `agent must be one of: ${AGENT_NAMES.join(", ")}`);
    }
    const row = await createThread({ agentType: body.agent, sandboxId: body.sandboxId ?? null });
    return json({ id: row.id }, 201);
  }

  if (parts[0] === "runs" && parts.length === 1 && method === "POST") return runStream(req);

  if (parts[0] === "sandboxes") {
    if (parts.length === 1 && method === "POST") return spawnSandbox(req);

    const id = parts[1];
    if (!id) throw new HttpError(404, "not found");
    const sub = parts[2];

    if (!sub) {
      if (method === "GET") return json(sandboxView(await (await sandboxOr404(id)).refresh()));
      if (method === "DELETE") {
        const sb = await sandboxOr404(id);
        await sb.destroy();
        dropSandboxCache(id);
        return json({ ok: true });
      }
    }

    const sb = await sandboxOr404(id);

    if (sub === "preview") {
      if (method === "POST") {
        await startPreview(sb);
        return json({ ok: true, previewUrl: sb.getPreviewUrl(PREVIEW_PORT) });
      }
      if (method === "GET") return json({ ready: await isPreviewReady(sb) });
    }

    if (sub === "tree" && method === "GET") return json(await listWorkspaceTree(sb));

    if (sub === "files") {
      if (method === "GET") {
        const path = requireString(url.searchParams.get("path"), "path");
        return json({ path, content: await sb.readFile(toSandboxPath(path)) });
      }
      if (method === "PUT") {
        const body = await readJson<{ path?: string; content?: string }>(req);
        const path = requireString(body.path, "path");
        await sb.writeFile(toSandboxPath(path), body.content ?? "");
        return json({ ok: true, path });
      }
      if (method === "DELETE") {
        const path = requireString(url.searchParams.get("path"), "path");
        await sb.deleteFile(toSandboxPath(path), true);
        return json({ ok: true, path });
      }
    }

    if (sub === "exec" && method === "POST") {
      const body = await readJson<{ command?: string; cwd?: string }>(req);
      const command = requireString(body.command, "command");
      const workdir = body.cwd
        ? body.cwd.startsWith("/") ? body.cwd : toSandboxPath(body.cwd)
        : "/workspace";
      const res = await sb.exec(command, { workdir, timeout: "5m" });
      return json({ stdout: res.stdout, stderr: res.stderr, exitCode: res.exit_code, duration: res.duration });
    }
  }

  throw new HttpError(404, `no route for ${method} ${url.pathname}`);
}

const server = Bun.serve({
  port: PORT,
  // Agent runs stream for minutes; Bun's default idle timeout would cut them.
  idleTimeout: 0,
  async fetch(req) {
    const cors = corsHeaders(req);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    let res: Response;
    try {
      res = await route(req);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : e instanceof PathError ? 400 : 500;
      const message = e instanceof Error ? e.message : String(e);
      if (status >= 500) console.error(`[server] ${req.method} ${new URL(req.url).pathname}:`, e);
      res = json({ error: message }, status);
    }
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  },
});

console.log(`[server] agent server listening on http://localhost:${server.port}`);
console.log(`[server] StacyVM at ${process.env.STACYVM_URL ?? "http://localhost:7423"}`);

const shutdown = async () => {
  for (const c of activeRuns.values()) c.abort();
  server.stop();
  await closePool().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
