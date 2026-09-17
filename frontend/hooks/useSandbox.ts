"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAgentState } from "./useAgentState";
import {
  agentServer,
  streamRun,
  SANDBOXLESS_AGENTS,
  type AgentEvent,
  type AgentName,
  type SandboxView,
} from "@/lib/agent/client";
import { agentEventToSignal } from "@/lib/agent/signals";

export type SandboxStatus = "idle" | "spawning" | "preview_starting" | "running" | "stopping" | "error";
export type AgentStatus = "disconnected" | "connecting" | "connected";
export type BindingsStatus = "idle" | "generating" | "success" | "error";

export interface SandboxInfo {
  sessionId: string;
  previewUrl: string;
  previewPort: number;
  agentPort: number;
}

export interface EditorChange {
  path: string;
  action: "create" | "update" | "delete";
  content: string;
}

export interface ChatResponse {
  chat: { message: string };
  editor: { changes: EditorChange[] };
}

export interface ChatProgress {
  phase: string;
  content: string;
}

export interface BindingsResponse {
  success: boolean;
  contractId: string;
  network: string;
  chat: { message: string };
  editor: { changes: EditorChange[] };
  error?: string;
}

export interface SandboxFileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modifiedAt?: string;
}

export interface FileTreeNode {
  id: string;
  name: string;
  type: "file" | "folder";
  children?: FileTreeNode[];
}

export interface FileTreeSyncData {
  tree: FileTreeNode[];
  files: SandboxFileInfo[];
}

export interface FileContentSyncData {
  path: string;
  content: string;
}

export interface UseSandboxReturn {
  status: SandboxStatus;
  agentStatus: AgentStatus;
  bindingsStatus: BindingsStatus;
  agentState: ReturnType<typeof useAgentState>;
  sandboxInfo: SandboxInfo | null;
  previewUrl: string | null;
  logs: string[];
  spawn: (envVars?: Record<string, string>) => Promise<void>;
  stop: () => Promise<void>;
  generateBindings: (contractId: string, network: "testnet" | "mainnet") => void;
  sendChatMessage: (prompt: string, context?: any) => void;
  executeCommand: (command: string, cwd?: string) => void;
  readFile: (path: string) => void;
  writeFile: (path: string, content: string) => void;
  deleteFile: (path: string) => void;
  listFiles: (path?: string) => void;
  listFilesRecursive: (path?: string) => void;
  syncFileTree: () => void;
  onChatResponse: ((response: ChatResponse) => void) | null;
  setOnChatResponse: (handler: ((response: ChatResponse) => void) | null) => void;
  onChatProgress: ((progress: ChatProgress) => void) | null;
  setOnChatProgress: (handler: ((progress: ChatProgress) => void) | null) => void;
  onBindingsResponse: ((response: BindingsResponse) => void) | null;
  setOnBindingsResponse: (handler: ((response: BindingsResponse) => void) | null) => void;
  onFileResponse: ((data: any) => void) | null;
  setOnFileResponse: (handler: ((data: any) => void) | null) => void;
  onFileTreeSync: ((data: FileTreeSyncData) => void) | null;
  setOnFileTreeSync: (handler: ((data: FileTreeSyncData) => void) | null) => void;
  onFileContentSync: ((data: FileContentSyncData) => void) | null;
  setOnFileContentSync: (handler: ((data: FileContentSyncData) => void) | null) => void;
  clearLogs: () => void;
  reset: () => void;
  isConnected: boolean;
  /** Feed an agent-server event into agentState and the follow-up file sync. */
  handleAgentEvent: (event: AgentEvent) => void;
}

const SANDBOX_STORAGE_KEY = "stacy.sandboxId";
const PREVIEW_POLL_MS = 3000;
const PREVIEW_TIMEOUT_MS = 180_000;

function storedSandboxId(): string | null {
  try {
    return window.localStorage.getItem(SANDBOX_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeSandboxId(id: string | null) {
  try {
    if (id) window.localStorage.setItem(SANDBOX_STORAGE_KEY, id);
    else window.localStorage.removeItem(SANDBOX_STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function useSandbox(): UseSandboxReturn {
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<SandboxStatus>("idle");
  const [agentStatus, setAgentStatus] = useState<AgentStatus>("disconnected");
  const [bindingsStatus, setBindingsStatus] = useState<BindingsStatus>("idle");
  const [sandboxInfo, setSandboxInfo] = useState<SandboxInfo | null>(null);
  const agentState = useAgentState();
  const { processSignal, reset: resetAgentState } = agentState;

  const sandboxIdRef = useRef<string | null>(null);
  const previewAbortRef = useRef<AbortController | null>(null);

  const chatResponseRef = useRef<((r: ChatResponse) => void) | null>(null);
  const chatProgressRef = useRef<((p: ChatProgress) => void) | null>(null);
  const bindingsResponseRef = useRef<((r: BindingsResponse) => void) | null>(null);
  const fileResponseRef = useRef<((d: any) => void) | null>(null);
  const fileTreeSyncRef = useRef<((d: FileTreeSyncData) => void) | null>(null);
  const fileContentSyncRef = useRef<((d: FileContentSyncData) => void) | null>(null);

  const log = useCallback((line: string) => {
    setLogs((prev) => [...prev.slice(-499), line]);
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  const requireSandbox = useCallback((): string | null => {
    const id = sandboxIdRef.current;
    if (!id) log("[sandbox] No sandbox running. Start one first.");
    return id;
  }, [log]);

  const attach = useCallback((view: SandboxView) => {
    sandboxIdRef.current = view.id;
    storeSandboxId(view.id);
    setSandboxInfo({
      sessionId: view.id,
      previewUrl: view.previewUrl,
      previewPort: view.previewPort,
      agentPort: 0,
    });
    setAgentStatus("connected");
  }, []);

  const detach = useCallback(() => {
    previewAbortRef.current?.abort();
    sandboxIdRef.current = null;
    storeSandboxId(null);
    setSandboxInfo(null);
    setAgentStatus("disconnected");
  }, []);

  const waitForPreview = useCallback(
    async (id: string) => {
      previewAbortRef.current?.abort();
      const controller = new AbortController();
      previewAbortRef.current = controller;
      setStatus("preview_starting");
      try {
        await agentServer.startPreview(id);
        const deadline = Date.now() + PREVIEW_TIMEOUT_MS;
        let ready = false;
        while (!controller.signal.aborted && Date.now() < deadline) {
          ready = (await agentServer.previewStatus(id)).ready;
          if (ready) break;
          await new Promise((r) => setTimeout(r, PREVIEW_POLL_MS));
        }
        if (controller.signal.aborted) return;
        log(
          ready
            ? "[sandbox] Preview is up."
            : "[sandbox] Preview is not responding yet; check /tmp/preview.log in the sandbox.",
        );
      } catch (e) {
        if (controller.signal.aborted) return;
        log(`[sandbox] Could not start preview: ${errorMessage(e)}`);
      }
      setStatus("running");
    },
    [log],
  );

  // Reattach to the sandbox from a previous page load if it is still alive.
  useEffect(() => {
    const id = storedSandboxId();
    if (!id) return;
    let cancelled = false;
    agentServer
      .getSandbox(id)
      .then((view) => {
        if (cancelled) return;
        if (view.state !== "running") {
          storeSandboxId(null);
          return;
        }
        log(`[sandbox] Reattached to ${view.id}`);
        attach(view);
        void waitForPreview(view.id);
      })
      .catch(() => {
        if (!cancelled) storeSandboxId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [attach, log, waitForPreview]);

  const spawn = useCallback(
    async (_envVars?: Record<string, string>) => {
      if (sandboxIdRef.current) {
        log(`[sandbox] Already running: ${sandboxIdRef.current}`);
        return;
      }
      setStatus("spawning");
      setAgentStatus("connecting");
      try {
        const view = await agentServer.spawnSandbox();
        log(`[sandbox] Sandbox ${view.id} ready`);
        attach(view);
        await waitForPreview(view.id);
      } catch (e) {
        log(`[sandbox] Spawn failed: ${errorMessage(e)}`);
        setStatus("error");
        setAgentStatus("disconnected");
      }
    },
    [attach, log, waitForPreview],
  );

  const stop = useCallback(async () => {
    const id = sandboxIdRef.current;
    if (!id) return;
    setStatus("stopping");
    try {
      await agentServer.destroySandbox(id);
      log(`[sandbox] Destroyed ${id}`);
    } catch (e) {
      log(`[sandbox] Destroy failed: ${errorMessage(e)}`);
    }
    detach();
    setStatus("idle");
  }, [detach, log]);

  const syncFileTree = useCallback(() => {
    const id = requireSandbox();
    if (!id) return;
    agentServer
      .tree(id)
      .then((data) => fileTreeSyncRef.current?.(data))
      .catch((e) => log(`[sync] File tree failed: ${errorMessage(e)}`));
  }, [log, requireSandbox]);

  const listFilesRecursive = useCallback(
    (_path?: string) => {
      const id = requireSandbox();
      if (!id) return;
      agentServer
        .tree(id)
        .then((data) => fileResponseRef.current?.({ type: "list", files: data.files }))
        .catch((e) => log(`[sync] Listing failed: ${errorMessage(e)}`));
    },
    [log, requireSandbox],
  );

  const readFile = useCallback(
    (path: string) => {
      const id = requireSandbox();
      if (!id) return;
      agentServer
        .readFile(id, path)
        .then((data) => {
          fileContentSyncRef.current?.(data);
          fileResponseRef.current?.({ type: "read", ...data });
        })
        .catch((e) => log(`[sync] Read ${path} failed: ${errorMessage(e)}`));
    },
    [log, requireSandbox],
  );

  const writeFile = useCallback(
    (path: string, content: string) => {
      const id = requireSandbox();
      if (!id) return;
      agentServer
        .writeFile(id, path, content)
        .then(() => fileResponseRef.current?.({ type: "write", path }))
        .catch((e) => log(`[sync] Write ${path} failed: ${errorMessage(e)}`));
    },
    [log, requireSandbox],
  );

  const deleteFile = useCallback(
    (path: string) => {
      const id = requireSandbox();
      if (!id) return;
      agentServer
        .deleteFile(id, path)
        .then(() => fileResponseRef.current?.({ type: "delete", path }))
        .catch((e) => log(`[sync] Delete ${path} failed: ${errorMessage(e)}`));
    },
    [log, requireSandbox],
  );

  const executeCommand = useCallback(
    (command: string, cwd?: string) => {
      const id = requireSandbox();
      if (!id) return;
      log(`[cmd] $ ${command}`);
      agentServer
        .exec(id, command, cwd)
        .then((res) => {
          for (const line of `${res.stdout}${res.stderr}`.split("\n")) {
            if (line) log(`[cmd] ${line}`);
          }
          log(`[cmd] exited with ${res.exitCode}`);
        })
        .catch((e) => log(`[cmd] ${errorMessage(e)}`));
    },
    [log, requireSandbox],
  );

  const handleAgentEvent = useCallback(
    (event: AgentEvent) => {
      const signal = agentEventToSignal(event);
      if (signal) processSignal(signal);
      if (event.type === "tool_call_ended" && !event.ok) {
        log(`[agent] ${event.tool} failed`);
      }
      // Agents write straight into the sandbox; pull the result into the editor.
      if (event.type === "agent_ended" && sandboxIdRef.current) {
        syncFileTree();
      }
    },
    [log, processSignal, syncFileTree],
  );

  // Imperative agent run for callers outside the chat panel (which streams
  // through AgentChatTransport instead).
  const runAgent = useCallback(
    async (agent: AgentName, message: string): Promise<{ text: string; ok: boolean }> => {
      const sandboxId = sandboxIdRef.current;
      if (!sandboxId && !SANDBOXLESS_AGENTS.has(agent)) {
        throw new Error("Start a sandbox first.");
      }
      const { id: threadId } = await agentServer.createThread(agent, sandboxId);
      let text = "";
      let ok = false;
      for await (const event of streamRun({ threadId, agent, sandboxId, message })) {
        handleAgentEvent(event);
        if (event.type === "thinking_chunk") {
          text += event.text;
          chatProgressRef.current?.({ phase: "executing", content: event.text });
        } else if (event.type === "tool_call_started" && !event.planned) {
          chatProgressRef.current?.({ phase: event.tool, content: "" });
        } else if (event.type === "error") {
          text += `\n\n${event.message}`;
        } else if (event.type === "agent_ended") {
          ok = event.status === "success";
        }
      }
      return { text, ok };
    },
    [handleAgentEvent],
  );

  const sendChatMessage = useCallback(
    (prompt: string, _context?: any) => {
      runAgent("orchestrator", prompt)
        .then(({ text }) =>
          chatResponseRef.current?.({ chat: { message: text }, editor: { changes: [] } }),
        )
        .catch((e) =>
          chatResponseRef.current?.({ chat: { message: errorMessage(e) }, editor: { changes: [] } }),
        );
    },
    [runAgent],
  );

  const generateBindings = useCallback(
    (contractId: string, network: "testnet" | "mainnet") => {
      setBindingsStatus("generating");
      const prompt =
        `Sync the ABI and deployed address for contract ${contractId} (${network}) into the frontend ` +
        `and generate typed wagmi hooks for it.`;
      runAgent("integration", prompt)
        .then(({ text, ok }) => {
          setBindingsStatus(ok ? "success" : "error");
          bindingsResponseRef.current?.({
            success: ok,
            contractId,
            network,
            chat: { message: text },
            editor: { changes: [] },
            error: ok ? undefined : text,
          });
        })
        .catch((e) => {
          setBindingsStatus("error");
          log(`[bindings] ${errorMessage(e)}`);
        });
    },
    [log, runAgent],
  );

  const reset = useCallback(() => {
    resetAgentState();
    setBindingsStatus("idle");
  }, [resetAgentState]);

  const setOnChatResponse = useCallback((h: ((r: ChatResponse) => void) | null) => {
    chatResponseRef.current = h;
  }, []);
  const setOnChatProgress = useCallback((h: ((p: ChatProgress) => void) | null) => {
    chatProgressRef.current = h;
  }, []);
  const setOnBindingsResponse = useCallback((h: ((r: BindingsResponse) => void) | null) => {
    bindingsResponseRef.current = h;
  }, []);
  const setOnFileResponse = useCallback((h: ((d: any) => void) | null) => {
    fileResponseRef.current = h;
  }, []);
  const setOnFileTreeSync = useCallback((h: ((d: FileTreeSyncData) => void) | null) => {
    fileTreeSyncRef.current = h;
  }, []);
  const setOnFileContentSync = useCallback((h: ((d: FileContentSyncData) => void) | null) => {
    fileContentSyncRef.current = h;
  }, []);

  return {
    status,
    agentStatus,
    bindingsStatus,
    agentState,
    sandboxInfo,
    previewUrl: status === "running" ? (sandboxInfo?.previewUrl ?? null) : null,
    logs,
    spawn,
    stop,
    generateBindings,
    sendChatMessage,
    executeCommand,
    readFile,
    writeFile,
    deleteFile,
    listFiles: listFilesRecursive,
    listFilesRecursive,
    syncFileTree,
    onChatResponse: chatResponseRef.current,
    setOnChatResponse,
    onChatProgress: chatProgressRef.current,
    setOnChatProgress,
    onBindingsResponse: bindingsResponseRef.current,
    setOnBindingsResponse,
    onFileResponse: fileResponseRef.current,
    setOnFileResponse,
    onFileTreeSync: fileTreeSyncRef.current,
    setOnFileTreeSync,
    onFileContentSync: fileContentSyncRef.current,
    setOnFileContentSync,
    clearLogs,
    reset,
    isConnected: agentStatus === "connected",
    handleAgentEvent,
  };
}
