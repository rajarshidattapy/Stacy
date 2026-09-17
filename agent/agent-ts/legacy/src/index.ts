// Main backend service. Lazily spawns one sandbox + agent per user on first chat.
//
// Routes:
//   POST /chat         {user_id, message} -> run agent turn
//   GET  /session/:id  -> session info
//   GET  /sessions     -> all live sessions
//   DELETE /session/:id -> release sandbox
//   GET  /health       -> {status, sessions, cost_summary}
//
// Run: bun src/index.ts
import { HumanMessage } from "@langchain/core/messages";
import { SessionRegistry, type Session } from "./session.js";

async function resolveSecrets(): Promise<void> {
  const arn = process.env.ANTHROPIC_KEY_SECRET_ARN;
  if (!arn || process.env.ANTHROPIC_API_KEY) return;
  const region = arn.split(":")[3] ?? process.env.AWS_REGION ?? "us-east-1";
  const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
  const client = new SecretsManagerClient({ region });
  const out = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  if (!out.SecretString) throw new Error(`secret ${arn} has no SecretString`);
  process.env.ANTHROPIC_API_KEY = out.SecretString.trim();
  console.log(`[boot] resolved ANTHROPIC_API_KEY from secret (len=${process.env.ANTHROPIC_API_KEY.length})`);
}

await resolveSecrets();

const registry = new SessionRegistry();
const NO_LLM = process.env.SERVICE_NO_LLM === "1";
const MAX_STEPS = parseInt(process.env.AGENT_MAX_STEPS ?? "30", 10);
const PORT = parseInt(process.env.SERVICE_PORT ?? process.env.PORT ?? "8080", 10);

const reaperTimer = setInterval(() => registry.reapIdle(), 30_000);

process.on("SIGTERM", async () => {
  clearInterval(reaperTimer);
  await registry.destroyAll();
  process.exit(0);
});

// ── Stub mode (SERVICE_NO_LLM=1): exercises sandbox without LLM cost ─────────

async function runStub(sess: Session, message: string): Promise<Record<string, unknown>> {
  const sb = sess.sandbox;
  const actions: Array<Record<string, unknown>> = [];

  async function step(name: string, fn: () => Promise<unknown>): Promise<void> {
    const t0 = performance.now();
    try {
      const out = await fn();
      actions.push({ step: name, ok: true, ms: Math.round(performance.now() - t0), out });
    } catch (err) {
      actions.push({ step: name, ok: false, ms: Math.round(performance.now() - t0), err: String(err) });
    }
  }

  const marker = Math.random().toString(36).slice(2, 10);
  const payload = `// chat ${sess.chatCount} from ${sess.userId} marker=${marker}\n// message: ${message.slice(0, 120)}\n`;
  const path = `/workspace/app/.chat-${marker}.tsx`;

  await step("whoami", async () => ({ sandbox_id: sb.id, image: sb.image, state: sb.state }));
  await step("write_file", async () => { await sb.writeFile(path, payload); return { path, bytes: payload.length }; });
  await step("exec_ls", async () => (await sb.exec("ls /workspace/app | head -10")).stdout.trim().split("\n"));
  await step("read_file", async () => ({ len: (await sb.readFile(path)).length }));
  await step("delete_file", async () => { await sb.deleteFile(path); return { path }; });

  return { mode: "stub", actions };
}

// ── Agent mode ────────────────────────────────────────────────────────────────

async function runAgent(sess: Session, message: string): Promise<Record<string, unknown>> {
  if (!sess.agent) throw new Error("agent not initialized (SERVICE_NO_LLM=1?)");

  const result = await sess.agent.invoke(
    { messages: [new HumanMessage(message)] },
    { recursionLimit: MAX_STEPS * 2 },
  );

  const msgs: Array<Record<string, unknown>> = [];
  for (const m of result.messages ?? []) {
    const role = m._getType?.() ?? m.constructor?.name ?? "unknown";
    const content = typeof m.content === "string"
      ? m.content
      : Array.isArray(m.content)
        ? m.content.map((p: unknown) => (typeof p === "object" && p !== null && "text" in p ? (p as { text: string }).text : String(p))).join("")
        : String(m.content);
    msgs.push({ role, content: content.slice(0, 2000) });
  }
  return { mode: "agent", messages: msgs };
}

// ── HTTP service ──────────────────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,

  routes: {
    "/ping": {
      GET: () => Response.json({ status: "Healthy" }),
    },

    "/invocations": {
      POST: async (req) => {
        const body = (await req.json().catch(() => ({}))) as {
          user_id?: string;
          message?: string;
          input?: { user_id?: string; message?: string; prompt?: string };
          prompt?: string;
        };
        const sessionHeader = req.headers.get("X-Amzn-Bedrock-AgentCore-Runtime-Session-Id");
        const userId = body.user_id ?? body.input?.user_id ?? sessionHeader ?? "anonymous";
        const message = body.message ?? body.input?.message ?? body.prompt ?? body.input?.prompt;
        if (!message) {
          return Response.json({ error: "message (or prompt) required" }, { status: 400 });
        }

        const preExisted = registry.get(userId) !== undefined;
        const t0 = performance.now();
        const sess = await registry.getOrCreate(userId);

        const maxCostUsd = parseFloat(process.env.BUDGET_MAX_USD ?? "10");
        const maxTokens = parseInt(process.env.BUDGET_MAX_TOKENS ?? "500000", 10);
        const budget = sess.costTracker.checkBudget(maxCostUsd, maxTokens);
        if (budget.exceeded) {
          return Response.json({ error: budget.message }, { status: 429 });
        }

        const unlock = await sess.mutex.lock();
        try {
          sess.lastUsed = Date.now();
          sess.chatCount++;
          const result = NO_LLM ? await runStub(sess, message) : await runAgent(sess, message);
          sess.lastUsed = Date.now();
          return Response.json({
            user_id: userId,
            sandbox_id: sess.sandbox.id,
            chat_count: sess.chatCount,
            spawn: !preExisted,
            elapsed_ms: Math.round(performance.now() - t0),
            cost: sess.costTracker.summary(),
            result,
          });
        } finally {
          unlock();
        }
      },
    },

    "/health": {
      GET: () => {
        const sessions = registry.list();
        const now = Date.now();
        return Response.json({
          status: "ok",
          sessions: sessions.length,
          no_llm: NO_LLM,
          idle_timeout_s: parseInt(process.env.SERVICE_IDLE_SEC ?? "600", 10),
          max_session_idle_s: sessions.length ? Math.max(...sessions.map((s) => (now - s.lastUsed) / 1000)) : 0,
        });
      },
    },

    "/sessions": {
      GET: () => {
        const now = Date.now();
        return Response.json(
          registry.list().map((s) => ({
            user_id: s.userId,
            sandbox_id: s.sandbox.id,
            image: s.sandbox.image,
            state: s.sandbox.state,
            chat_count: s.chatCount,
            age_s: Math.round((now - s.createdAt) / 100) / 10,
            idle_s: Math.round((now - s.lastUsed) / 100) / 10,
            cost: s.costTracker.summary(),
          })),
        );
      },
    },

    "/session/:userId": {
      GET: (req) => {
        const sess = registry.get(req.params.userId);
        if (!sess) return Response.json({ error: "no session" }, { status: 404 });
        const now = Date.now();
        return Response.json({
          user_id: sess.userId,
          sandbox_id: sess.sandbox.id,
          image: sess.sandbox.image,
          state: sess.sandbox.state,
          chat_count: sess.chatCount,
          age_s: Math.round((now - sess.createdAt) / 100) / 10,
          idle_s: Math.round((now - sess.lastUsed) / 100) / 10,
          cost: sess.costTracker.summary(),
        });
      },
      DELETE: async (req) => {
        const ok = await registry.drop(req.params.userId);
        if (!ok) return Response.json({ error: "no session" }, { status: 404 });
        return Response.json({ status: "destroyed", user_id: req.params.userId });
      },
    },

    "/chat": {
      POST: async (req) => {
        const body = (await req.json()) as { user_id?: string; message?: string };
        if (!body.user_id || !body.message) {
          return Response.json({ error: "user_id and message required" }, { status: 400 });
        }

        const preExisted = registry.get(body.user_id) !== undefined;
        const t0 = performance.now();
        const sess = await registry.getOrCreate(body.user_id);

        // Budget check before each turn.
        const maxCostUsd = parseFloat(process.env.BUDGET_MAX_USD ?? "10");
        const maxTokens = parseInt(process.env.BUDGET_MAX_TOKENS ?? "500000", 10);
        const budget = sess.costTracker.checkBudget(maxCostUsd, maxTokens);
        if (budget.exceeded) {
          return Response.json({ error: budget.message }, { status: 429 });
        }
        if (budget.warning) {
          console.warn(`[budget] user=${body.user_id} ${budget.message}`);
        }

        const unlock = await sess.mutex.lock();
        try {
          sess.lastUsed = Date.now();
          sess.chatCount++;

          const result = NO_LLM ? await runStub(sess, body.message) : await runAgent(sess, body.message);
          sess.lastUsed = Date.now();

          return Response.json({
            user_id: body.user_id,
            sandbox_id: sess.sandbox.id,
            chat_count: sess.chatCount,
            spawn: !preExisted,
            elapsed_ms: Math.round(performance.now() - t0),
            cost: sess.costTracker.summary(),
            result,
          });
        } finally {
          unlock();
        }
      },
    },
  },

  error(err) {
    console.error("[server]", err);
    return Response.json({ error: String(err) }, { status: 500 });
  },
});

console.log(
  `[server] listening on :${server.port}  forgevm=${process.env.FORGEVM_URL ?? "http://localhost:7423"}  image=${process.env.SANDBOX_IMAGE ?? "forge-nextjs-sandbox:latest"}  no_llm=${NO_LLM}`,
);
