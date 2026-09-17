// Run one deep agent against a sandbox.
//
// Two modes:
//   --attach <id>   reuse an existing sandbox (no spawn, no destroy at end)
//   default         spawn fresh, destroy at end (--keep to retain)
//
// Usage:
//   bun src/run_single.ts "Edit /workspace/app/page.tsx ..."
//   bun src/run_single.ts --attach sb-17dec83f "Add a footer to app/page.tsx"
import { Client } from "forgevm";
import { buildAgentWithRouting } from "./agent.ts";

const DEFAULT_PROMPT =
  "Replace /workspace/app/page.tsx with a clean landing page titled 'ForgeVM x Next.js' " +
  "containing a hero section, three feature cards (Sandboxed, Scalable, Fast), and a footer. " +
  "Use Tailwind utility classes only. Then run `npm run build` and confirm the build succeeded.";

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const R       = "\x1b[0m";
const B       = "\x1b[1m";
const DIM     = "\x1b[2m";
const CYAN    = "\x1b[36m";
const YELLOW  = "\x1b[33m";
const GREEN   = "\x1b[32m";
const BLUE    = "\x1b[34m";
const GREY    = "\x1b[90m";
const MAGENTA = "\x1b[35m";
const RED     = "\x1b[31m";

function ts(): string {
  return new Date().toTimeString().slice(0, 8);
}

function hr(char = "─", width = 70): string {
  return char.repeat(width);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + `\n${GREY}… [${s.length - max} chars truncated]${R}` : s;
}

const DEBUG = process.env.DEBUG === "1";

// ── Arg parser ────────────────────────────────────────────────────────────────
function parseArgs() {
  const argv = process.argv.slice(2);
  let attach: string | null = null;
  let keep = false;
  let prompt = DEFAULT_PROMPT;
  const rest: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--attach" && argv[i + 1]) {
      attach = argv[++i];
    } else if (argv[i] === "--keep") {
      keep = true;
    } else {
      rest.push(argv[i]);
    }
  }
  if (rest.length) prompt = rest.join(" ");
  return { attach, keep, prompt };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const { attach, keep, prompt } = parseArgs();

  const baseUrl  = process.env.FORGEVM_URL      ?? "http://localhost:7423";
  const apiKey   = process.env.FORGEVM_API_KEY  || undefined;
  const image    = process.env.SANDBOX_IMAGE    ?? "forge-nextjs-sandbox:latest";
  const ttl      = process.env.SANDBOX_TTL      ?? "12m";
  const maxSteps = parseInt(process.env.AGENT_MAX_STEPS ?? "40", 10);

  const client = new Client({ baseUrl, apiKey, timeout: 120_000 });

  let spawned = false;
  let sandbox;

  if (attach) {
    sandbox = await client.get(attach);
    console.log(`\n${BLUE}${hr("═")}${R}`);
    console.log(`${B}${BLUE}[attach] sandbox=${sandbox.id}  state=${sandbox.state}  image=${sandbox.image}${R}`);
    console.log(`${BLUE}${hr("═")}${R}\n`);
  } else {
    console.log(`\n${BLUE}${hr("═")}${R}`);
    console.log(`${B}${BLUE}[orchestrator] spawning  image=${image}  ttl=${ttl}${R}`);
    const t0 = performance.now();
    sandbox = await client.spawn({ image, ttl });
    spawned = true;
    console.log(`${B}${BLUE}[orchestrator] sandbox=${sandbox.id}  spawn=${Math.round(performance.now() - t0)}ms${R}`);
    console.log(`${BLUE}${hr("═")}${R}\n`);
  }

  try {
    const warm = await sandbox.exec("node --version && ls /workspace/app && cat /workspace/package.json | head -20");
    console.log(`${GREY}[warmup] exit=${warm.exit_code}\n${warm.stdout}${R}`);

    const agent = buildAgentWithRouting(sandbox);

    console.log(`\n${MAGENTA}${hr("═")}${R}`);
    console.log(`${B}${MAGENTA}[agent] prompt:${R}`);
    console.log(`  ${prompt}`);
    console.log(`${MAGENTA}${hr("═")}${R}`);

    const t1 = performance.now();
    let step = 0;
    let toolCallStep = 0;

    // ── Streaming state ────────────────────────────────────────────────────
    // Track whether we're mid-stream so we can newline before the next header.
    let inStream = false;

    // Track the "context key" of the current stream so we know when it changes
    // and need to print a new section header.
    let streamCtx = "";

    // Buffer partial tool-call args while the LLM streams them.
    // key = tool_call id, value = { name, argsBuf }
    const pendingCalls = new Map<string, { name: string; argsBuf: string }>();

    const flushStream = () => {
      if (inStream) { process.stdout.write("\n"); inStream = false; }
    };

    // ── Stream: messages mode + subgraphs ─────────────────────────────────
    // Each yield: [namespace, [message, metadata]]
    //   namespace  – [] for main agent, ["tools:<id>", ...] for subagents
    //   message    – AIMessageChunk (tokens / tool_call_chunks) or ToolMessage
    const stream = await agent.stream(
      { messages: [{ role: "user", content: prompt }] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { streamMode: "messages", subgraphs: true, recursionLimit: maxSteps * 2 } as any,
    );

    for await (const raw of stream) {
      const [namespace, innerChunk] = raw as unknown as [string[], unknown];

      // innerChunk is [message, metadata] in messages mode
      const message = Array.isArray(innerChunk)
        ? (innerChunk as unknown[])[0]
        : innerChunk;

      // Resolve namespace label
      const ns = namespace ?? [];
      const isSubagent = ns.some((s: string) => s.startsWith("tools:"));
      const subId = ns.find((s: string) => s.startsWith("tools:"))?.split(":")[1]?.slice(0, 8);
      const prefix      = isSubagent ? `SUB[${subId}]` : "AGENT";
      const prefixColor = isSubagent ? MAGENTA : CYAN;

      const msg  = message as Record<string, unknown>;
      const role = (msg._getType as (() => string) | undefined)?.call(msg) ?? String(msg.type ?? "?");

      if (DEBUG) {
        console.log(`${GREY}[debug] ns=${JSON.stringify(ns)} role=${role} keys=${Object.keys(msg).join(",")}${R}`);
      }

      // ── AI message chunk ─────────────────────────────────────────────────
      if (role === "ai") {
        const content        = msg.content as string | unknown[];
        const toolCallChunks = msg.tool_call_chunks as Array<{
          name?: string; args?: string; id?: string; index?: number;
        }> | undefined;
        const toolCalls = msg.tool_calls as Array<{
          name: string; args: Record<string, unknown>; id?: string;
        }> | undefined;

        // — Extended thinking blocks —
        if (Array.isArray(content)) {
          for (const block of content) {
            const b = block as Record<string, unknown>;
            if (b.type === "thinking" && typeof b.thinking === "string" && b.thinking) {
              const ctx = `${prefix}:thinking`;
              if (streamCtx !== ctx) {
                flushStream();
                console.log(`\n${GREY}${hr()}${R}`);
                console.log(`${B}${GREY}[${ts()}] ${prefix} · THINKING${R}`);
                streamCtx = ctx;
              }
              process.stdout.write(DIM + truncate(b.thinking, 1500) + R);
              inStream = true;
            }
          }
        }

        // — Text tokens (streamed in real-time) —
        let text = "";
        if (typeof content === "string") {
          text = content;
        } else if (Array.isArray(content)) {
          for (const block of content) {
            const b = block as Record<string, unknown>;
            if (b.type === "text" && typeof b.text === "string") text += b.text;
          }
        }

        if (text) {
          const ctx = `${prefix}:text`;
          if (streamCtx !== ctx) {
            flushStream();
            step++;
            console.log(`\n${prefixColor}${hr()}${R}`);
            console.log(`${B}${prefixColor}[${ts()}] step ${step} · ${prefix} · AI${R}`);
            streamCtx = ctx;
          }
          process.stdout.write(text);
          inStream = true;
        }

        // — Streaming tool-call chunks (LLM deciding which tool to call) —
        if (toolCallChunks?.length) {
          for (const tc of toolCallChunks) {
            const id = tc.id ?? `idx-${tc.index ?? 0}`;
            if (tc.name) {
              // First chunk for this tool call — print the call header
              flushStream();
              toolCallStep++;
              pendingCalls.set(id, { name: tc.name, argsBuf: tc.args ?? "" });
              console.log(`\n${YELLOW}${hr()}${R}`);
              console.log(`${B}${YELLOW}[${ts()}] ${prefix} · CALL → ${tc.name}${R}`);
              streamCtx = `${prefix}:call:${tc.name}`;
            } else if (tc.args) {
              // Accumulate streaming arg fragments silently
              const pending = pendingCalls.get(id);
              if (pending) pending.argsBuf += tc.args;
            }
          }
        }

        // — Final assembled tool_calls (full args now available) —
        if (toolCalls?.length) {
          for (const tc of toolCalls) {
            const hasArgs = Object.keys(tc.args ?? {}).length > 0;
            if (hasArgs) {
              const argLines = Object.entries(tc.args)
                .map(([k, v]) => {
                  const valStr = typeof v === "string" ? v : JSON.stringify(v, null, 2);
                  return `  ${GREY}${k}:${R} ${truncate(valStr, 800)}`;
                })
                .join("\n");
              console.log(argLines);
            }
            pendingCalls.delete(tc.id ?? "");
          }
        }

      // ── Tool result ──────────────────────────────────────────────────────
      } else if (role === "tool") {
        flushStream();
        const toolName  = (msg.name as string | undefined) ?? "tool";
        const rawResult = typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
        const isError = /\[.*error.*\]/i.test(rawResult.slice(0, 60));
        const color   = isError ? RED : GREEN;
        console.log(`\n${color}${hr()}${R}`);
        console.log(`${B}${color}[${ts()}] ${prefix} · RESULT ← ${toolName}${R}`);
        console.log(DIM + truncate(rawResult, 2000) + R);
        streamCtx = `${prefix}:result`;

      // ── Human messages — already shown above, skip ───────────────────────
      } else if (role === "human") {
        // intentionally skipped

      // ── Unknown — only show in debug mode ───────────────────────────────
      } else if (DEBUG) {
        flushStream();
        console.log(`${GREY}[${ts()}] ${prefix} · ${role}${R}`);
        const preview = JSON.stringify(msg).slice(0, 300);
        if (preview) console.log(GREY + DIM + preview + R);
      }
    }

    // Ensure we end on a newline if tokens were streaming
    flushStream();

    const agentSecs = ((performance.now() - t1) / 1000).toFixed(1);
    console.log(`\n${BLUE}${hr("═")}${R}`);
    console.log(`${B}${BLUE}[done] sandbox=${sandbox.id}  steps=${step}  tool_calls=${toolCallStep}  elapsed=${agentSecs}s${R}`);
    console.log(`${BLUE}${hr("═")}${R}\n`);

  } finally {
    if (spawned && !keep) {
      await sandbox.destroy().catch((err: unknown) => console.warn("[cleanup]", err));
      console.log(`${GREY}[cleanup] destroyed ${sandbox.id}${R}`);
    } else {
      console.log(`${GREY}[keep] sandbox left alive: ${sandbox.id}${R}`);
    }
  }
}

main().catch((err) => {
  console.error(`${RED}[fatal]${R}`, err);
  process.exit(1);
});
