"use client";

import { useState, useCallback } from "react";
import { useAgentState } from "./useAgentState";

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
}

export function useSandbox(): UseSandboxReturn {
  const [logs, setLogs] = useState<string[]>([]);
  const agentState = useAgentState();

  const clearLogs = useCallback(() => setLogs([]), []);
  const noop = useCallback(() => {}, []);
  const noopAsync = useCallback(async () => {}, []);

  return {
    status: "idle",
    agentStatus: "disconnected",
    bindingsStatus: "idle",
    agentState,
    sandboxInfo: null,
    previewUrl: null,
    logs,
    spawn: noopAsync,
    stop: noopAsync,
    generateBindings: noop,
    sendChatMessage: noop,
    executeCommand: noop,
    readFile: noop,
    writeFile: noop,
    deleteFile: noop,
    listFiles: noop,
    listFilesRecursive: noop,
    syncFileTree: noop,
    onChatResponse: null,
    setOnChatResponse: noop,
    onChatProgress: null,
    setOnChatProgress: noop,
    onBindingsResponse: null,
    setOnBindingsResponse: noop,
    onFileResponse: null,
    setOnFileResponse: noop,
    onFileTreeSync: null,
    setOnFileTreeSync: noop,
    onFileContentSync: null,
    setOnFileContentSync: noop,
    clearLogs,
    reset: noop,
    isConnected: false,
  };
}
