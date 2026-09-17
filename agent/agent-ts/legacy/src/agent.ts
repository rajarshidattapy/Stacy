// Agent factory. One deep agent per sandbox.
//
// Uses deepagents' createDeepAgent with ForgeVMSandboxBackend so all built-in
// tools (ls, read_file, write_file, edit_file, glob, grep, execute) run inside
// the real ForgeVM container. Extra tools expose ForgeVM-native operations that
// don't require shelling out (move/chmod/stat/delete/etc), plus web_search.
import { createDeepAgent } from "deepagents";
import type { Sandbox } from "forgevm";
import { ForgeVMSandboxBackend } from "./forgevm_backend.ts";
import { buildExtraTools, buildWebSearchTool } from "./tools.ts";
import { ModelRouter } from "../../model_router/ts/index.ts";

export const DEFAULT_SYSTEM_PROMPT = `You are a senior full-stack engineer (Next.js + React + TypeScript + Tailwind) operating inside an isolated ForgeVM Docker sandbox.

Sandbox identity: __SANDBOX_ID__ (image: __SANDBOX_IMAGE__, provider: __SANDBOX_PROVIDER__)
All tools operate on this sandbox's real filesystem and shell. Never invent sandbox IDs.

Pre-installed:
- Node 22, npm, git, curl, jq, python3, ffmpeg, imagemagick, Chromium libs (Playwright-ready)
- Scaffolded Next.js app at /workspace with App Router, Tailwind v4, node_modules present
- Default dev port: 3000

Built-in tools (via backend):
- execute(command): run shell commands — grep, patch, build, test, etc.
- ls(path): list directory entries
- read_file(file_path, offset?, limit?): read a file (paginated)
- write_file(file_path, content): create a NEW file — FAILS if the file already exists
- edit_file(file_path, old_string, new_string, replace_all?): targeted in-place edit of an existing file
- overwrite_file(file_path, content): fully replace an existing file's content (use when you need a complete rewrite)
- glob(pattern, path?): find files — NEVER glob over node_modules
- grep(pattern, path?, glob?): search file contents

Extra tools:
- whoami(): confirm sandbox identity (call first)
- sandbox_list_files(path): list directory entries (ForgeVM native)
- sandbox_read_file(path, ...): read an entire file as text (ForgeVM native, truncated)
- sandbox_write_file(path, content, mode?): write/overwrite a file (ForgeVM native)
- sandbox_move_file(old_path, new_path): move/rename a file (ForgeVM native)
- sandbox_chmod_file(path, mode): chmod a file (ForgeVM native)
- sandbox_stat_file(path): stat a file/dir (ForgeVM native)
- sandbox_glob_files(pattern): provider/shell-style glob (ForgeVM native; may not support recursive '**')
- sandbox_delete_file(path, recursive?): delete file/dir (ForgeVM native)
- sandbox_refresh(): refresh sandbox info (ForgeVM native)
- sandbox_get_preview_url(port): get preview URL for a port (ForgeVM native)
- sandbox_destroy(confirm="DESTROY"): DANGEROUS, destroys sandbox (ForgeVM native)
- exec_stream(command): streaming exec for long-running builds/installs
- extend_ttl(ttl): prevent sandbox expiry during long tasks
- web_search(query): search docs, packages, error solutions

Rules:
1. Call whoami() first, then ls("/workspace") and read_file("/workspace/app/page.tsx")
2. NEVER glob node_modules — it has 1000+ entries and will overflow context
3. Modify existing files with edit_file (targeted edits) or overwrite_file (full rewrites). Use write_file ONLY for brand-new files. Never call write_file on a path that already exists. Prefer sandbox_write_file only when you explicitly need ForgeVM-native overwrite or file mode handling.
4. Use Tailwind v4 utility classes only (CSS-driven via globals.css, no config needed)
5. Run execute("npm run build") to verify. Inspect exit_code — if non-zero, fix and retry
6. Run dev: execute("npm run dev -- -H 0.0.0.0 -p 3000 >/tmp/dev.log 2>&1 &") then execute("sleep 2 && curl -fsS http://127.0.0.1:3000 | head -c 200")
7. Call extend_ttl("30m") before any operation expected to run > 5 minutes
8. Use web_search for: npm package docs, error messages you cannot diagnose, API references
9. Stop and summarize once the task is verifiably complete`;

export type ModelTier = "haiku" | "sonnet" | "opus";

const MODEL_IDS: Record<ModelTier, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-7",
};

export interface BuildAgentOptions {
  model?: string;
  modelTier?: ModelTier;
  systemPrompt?: string;
  execTimeoutSeconds?: number;
  name?: string;
}

// Concrete agent type returned by createDeepAgent.
export type DeepAgentInstance = ReturnType<typeof createDeepAgent>;

// Reuse deepagents' own input/config/result types so the wrapper stays in sync
// with whatever deepagents publishes. Avoids hand-rolled message shapes.
export type AgentInvokeInput = Parameters<DeepAgentInstance["invoke"]>[0];
export type AgentInvokeConfig = Parameters<DeepAgentInstance["invoke"]>[1];
export type AgentInvokeResult = Awaited<ReturnType<DeepAgentInstance["invoke"]>>;
export type AgentStreamResult = Awaited<ReturnType<DeepAgentInstance["stream"]>>;

// Minimal surface that callers (session, index, run_single) actually use.
// Both buildAgent (full DeepAgent) and buildAgentWithRouting (wrapper) satisfy this.
export interface AgentLike {
  invoke(input: AgentInvokeInput, config?: AgentInvokeConfig): Promise<AgentInvokeResult>;
  stream(input: AgentInvokeInput, config?: AgentInvokeConfig): Promise<AgentStreamResult>;
}

export function buildAgent(sandbox: Sandbox, options: BuildAgentOptions = {}): DeepAgentInstance {
  const modelId = options.model ?? process.env.ANTHROPIC_MODEL ?? MODEL_IDS[options.modelTier ?? "sonnet"];

  const rawPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const systemPrompt = rawPrompt
    .replace("__SANDBOX_ID__", sandbox.id)
    .replace("__SANDBOX_IMAGE__", sandbox.image ?? "unknown")
    .replace("__SANDBOX_PROVIDER__", sandbox.provider ?? "unknown");

  const backend = new ForgeVMSandboxBackend(sandbox, options.execTimeoutSeconds ?? 120);

  const extraTools = buildExtraTools(sandbox);
  const tavilyKey = process.env.TAVILY_API_KEY;
  const tools = tavilyKey ? [...extraTools, buildWebSearchTool(tavilyKey)] : extraTools;

  return createDeepAgent({
    model: modelId,
    backend,
    tools,
    systemPrompt,
    name: options.name ?? `forgevm-agent-${sandbox.id}`,
  });
}

export function resolveModelId(tier?: ModelTier): string {
  return process.env.ANTHROPIC_MODEL ?? MODEL_IDS[tier ?? "sonnet"];
}

export interface BuildAgentWithRoutingOptions extends BuildAgentOptions {
  userId?: string;
  enableRouting?: boolean;
}

// Best-effort coercion of deepagents' message input into the router's
// {role, content} list. Handles: string, [role, content] tuples, BaseMessage
// instances, and plain dicts.
function extractRouterMessages(input: AgentInvokeInput): Array<{ role: string; content: unknown }> {
  const raw = (input as { messages?: unknown }).messages;
  const list: unknown[] = Array.isArray(raw) ? raw : raw !== undefined ? [raw] : [];

  return list.map((m) => {
    if (typeof m === "string") {
      return { role: "user", content: m };
    }
    if (Array.isArray(m)) {
      return { role: String(m[0] ?? "user"), content: m[1] };
    }
    const obj = m as { type?: unknown; role?: unknown; content?: unknown; _getType?: () => string };
    const role =
      typeof obj._getType === "function"
        ? obj._getType()
        : typeof obj.type === "string"
          ? obj.type
          : typeof obj.role === "string"
            ? obj.role
            : "user";
    return { role, content: obj.content };
  });
}

export function buildAgentWithRouting(
  sandbox: Sandbox,
  options: BuildAgentWithRoutingOptions = {},
): AgentLike {
  const { userId = "default", enableRouting = true, ...buildOptions } = options;

  if (!enableRouting) {
    return buildAgent(sandbox, buildOptions);
  }

  const router = new ModelRouter();

  const pickAgent = (input: AgentInvokeInput): DeepAgentInstance => {
    const messages = extractRouterMessages(input);
    const result = router.route(messages, userId);
    console.log(
      `[Router] tier=${result.tier} model=${result.model} score=${result.score.toFixed(3)} confidence=${result.confidence.toFixed(2)}`,
    );
    return buildAgent(sandbox, { ...buildOptions, model: result.model });
  };

  return {
    invoke(input, config) {
      return pickAgent(input).invoke(input, config);
    },
    stream(input, config) {
      return pickAgent(input).stream(input, config);
    },
  };
}
