// Client for the agent server (agent/agent-ts/src/server). The server owns
// StacyVM access and the agents; the IDE only talks to it over HTTP + SSE.

export const AGENT_SERVER_URL = (
  process.env.NEXT_PUBLIC_AGENT_SERVER_URL ?? "http://localhost:8787"
).replace(/\/$/, "");

export type AgentName =
  | "planner"
  | "orchestrator"
  | "smart-contract"
  | "frontend"
  | "integration"
  | "audit";

export const SANDBOXLESS_AGENTS: ReadonlySet<AgentName> = new Set(["planner"]);

// Mirror of agent/agent-ts/src/streaming/events.ts.
export type AgentEvent =
  | { type: "agent_started"; agent: string; threadId: string; runId: string }
  | { type: "thinking_started"; profile?: string; modelName?: string }
  | { type: "thinking_chunk"; text: string }
  | { type: "thinking_ended"; tokensIn?: number; tokensOut?: number; ms?: number }
  | { type: "tool_call_started"; tool: string; args: Record<string, unknown>; callId?: string; planned?: boolean }
  | { type: "tool_call_ended"; tool: string; result: unknown; ms?: number; ok: boolean; callId?: string }
  | { type: "todo_updated"; todos: unknown[] }
  | { type: "subagent_spawned"; parentRunId: string; subagentName: string; taskDescription: string; subagentRunId?: string }
  | { type: "subagent_event"; subagentRunId: string; innerEvent: AgentEvent }
  | { type: "subagent_returned"; subagentRunId: string; summary: unknown }
  | { type: "agent_message"; text: string }
  | { type: "phase_complete"; phase: string; summary: unknown }
  | { type: "awaiting_user_input"; reason: string; context?: unknown }
  | { type: "error"; where: string; message: string; stack?: string }
  | { type: "agent_ended"; status: string; finalSummary?: unknown; totalTokens?: number; ms?: number };

export interface SandboxView {
  id: string;
  state: string;
  previewUrl: string;
  previewPort: number;
}

export interface FileTreeNode {
  id: string;
  name: string;
  type: "file" | "folder";
  children?: FileTreeNode[];
}

export interface WorkspaceFileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
}

export class AgentServerError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${AGENT_SERVER_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new AgentServerError(0, `Agent server unreachable at ${AGENT_SERVER_URL}. Is it running?`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AgentServerError(res.status, (body as { error?: string }).error ?? res.statusText);
  }
  return body as T;
}

const q = (path: string) => encodeURIComponent(path);

export const agentServer = {
  health: () =>
    request<{ ok: boolean; stacyvm: boolean; database: boolean; agents: AgentName[] }>("/health"),

  spawnSandbox: (opts: { image?: string; ttl?: string } = {}) =>
    request<SandboxView>("/sandboxes", { method: "POST", body: JSON.stringify(opts) }),
  getSandbox: (id: string) => request<SandboxView>(`/sandboxes/${id}`),
  destroySandbox: (id: string) => request<{ ok: true }>(`/sandboxes/${id}`, { method: "DELETE" }),

  startPreview: (id: string) =>
    request<{ ok: true; previewUrl: string }>(`/sandboxes/${id}/preview`, { method: "POST" }),
  previewStatus: (id: string) => request<{ ready: boolean }>(`/sandboxes/${id}/preview`),

  tree: (id: string) =>
    request<{ tree: FileTreeNode[]; files: WorkspaceFileInfo[] }>(`/sandboxes/${id}/tree`),
  readFile: (id: string, path: string) =>
    request<{ path: string; content: string }>(`/sandboxes/${id}/files?path=${q(path)}`),
  writeFile: (id: string, path: string, content: string) =>
    request<{ ok: true; path: string }>(`/sandboxes/${id}/files`, {
      method: "PUT",
      body: JSON.stringify({ path, content }),
    }),
  deleteFile: (id: string, path: string) =>
    request<{ ok: true; path: string }>(`/sandboxes/${id}/files?path=${q(path)}`, { method: "DELETE" }),
  exec: (id: string, command: string, cwd?: string) =>
    request<{ stdout: string; stderr: string; exitCode: number; duration: string }>(
      `/sandboxes/${id}/exec`,
      { method: "POST", body: JSON.stringify({ command, cwd }) },
    ),

  createThread: (agent: AgentName, sandboxId: string | null) =>
    request<{ id: string }>("/threads", {
      method: "POST",
      body: JSON.stringify({ agent, sandboxId }),
    }),
};

/** Start an agent run and yield its events until the stream ends. */
export async function* streamRun(
  args: { threadId: string; agent: AgentName; sandboxId: string | null; message: string },
  signal?: AbortSignal,
): AsyncGenerator<AgentEvent> {
  let res: Response;
  try {
    res = await fetch(`${AGENT_SERVER_URL}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
      signal,
    });
  } catch (e) {
    if (signal?.aborted) return;
    throw new AgentServerError(0, `Agent server unreachable at ${AGENT_SERVER_URL}. Is it running?`);
  }
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    throw new AgentServerError(res.status, (body as { error?: string }).error ?? res.statusText);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const data = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data) yield JSON.parse(data) as AgentEvent;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
