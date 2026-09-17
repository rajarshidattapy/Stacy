"use client";

import { useState, useCallback } from "react";

export function isAgentSignal(_msg: unknown): boolean {
  return false;
}

export interface AgentFileChange {
  path: string;
  operation: "write" | "delete";
  content?: string;
}

export interface AgentTokenUsage {
  input: number;
  output: number;
  cost_usd: number;
}

export type AgentSignal =
  | { type: "agent.idle" }
  | { type: "agent.thinking"; phase: "planning" | "executing" | "validating" | "retrying" }
  | { type: "agent.tool_call"; tool: string; args: Record<string, unknown>; iteration: number }
  | { type: "agent.tool_result"; tool: string; success: boolean; duration_ms: number }
  | { type: "agent.retry"; attempt: number; reason: string; failure_type: string }
  | { type: "agent.stream_chunk"; content: string }
  | { type: "agent.done"; message: string; file_changes: AgentFileChange[]; model: string; tokens: AgentTokenUsage }
  | { type: "agent.error"; message: string; code: string; recoverable: boolean }
  | { type: "sandbox.starting" }
  | { type: "sandbox.ready" }
  | { type: "sandbox.crashed"; reason: string };

export type AgentStatus = "idle" | "thinking" | "executing" | "validating" | "retrying" | "error" | "done";

export interface AgentState {
  status: AgentStatus;
  currentTool: string | null;
  currentFile: string | null;
  retryCount: number;
  maxRetries: number;
  retryReason: string | null;
  tokenUsage: AgentTokenUsage | null;
  model: string | null;
  lastError: { message: string; code: string; recoverable: boolean } | null;
  isLoading: boolean;
}

export type PhaseKey = "planning" | "building" | "testing" | "deploying" | "integrating";

export interface StepEntry {
  id: string;
  tool: string;
  label: string;
  summary: string;
  status: "success" | "error";
  timestamp: number;
  errorMessage?: string;
}

export interface PhaseGroup {
  phase: PhaseKey;
  label: string;
  status: "pending" | "active" | "done" | "error";
  steps: StepEntry[];
}

// Tool names come from agent/agent-ts (src/agents/*/tools.ts).
const TOOL_PHASE_MAP: Record<string, PhaseKey> = {
  kickoff_project: "planning",
  update_project_todos: "planning",
  lookup_template: "planning",
  save_prd: "planning",
  delegate: "planning",
  sandbox_write: "building",
  sandbox_edit: "building",
  overwrite_file: "building",
  apply_patch: "building",
  sandbox_delete: "building",
  sandbox_move: "building",
  bash: "building",
  exec_stream: "building",
  forge_build: "building",
  forge_fmt: "building",
  bun_install: "building",
  bun_run_build: "building",
  forge_test: "testing",
  bun_run_lint: "testing",
  bun_dev_smoke: "testing",
  slither_audit: "testing",
  write_audit_report: "testing",
  forge_deploy_sepolia: "deploying",
  deploy_contract: "deploying",
  extract_abi: "integrating",
  forge_inspect_abi: "integrating",
  sync_abi_to_frontend: "integrating",
  read_deployed_address: "integrating",
  write_contract_address_constants: "integrating",
};

const TOOL_LABELS: Record<string, string> = {
  kickoff_project: "Planned project",
  update_project_todos: "Updated todos",
  save_prd: "Saved PRD",
  delegate: "Delegated task",
  sandbox_write: "Wrote file",
  sandbox_edit: "Edited file",
  overwrite_file: "Wrote file",
  apply_patch: "Patched files",
  sandbox_delete: "Deleted file",
  bash: "Ran command",
  forge_build: "Compiled contracts",
  forge_test: "Ran contract tests",
  forge_deploy_sepolia: "Deployed to Sepolia",
  deploy_contract: "Deployed contract",
  bun_install: "Installed packages",
  bun_run_build: "Built frontend",
  bun_run_lint: "Linted frontend",
  sync_abi_to_frontend: "Synced ABI",
  write_contract_address_constants: "Wrote contract addresses",
  slither_audit: "Ran Slither",
  write_audit_report: "Wrote audit report",
};

function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? tool.replace(/_/g, " ").replace(/\w/g, c => c.toUpperCase());
}

function toolPhase(tool: string): PhaseKey {
  return TOOL_PHASE_MAP[tool] ?? "building";
}

function makeSummary(tool: string, args: Record<string, unknown>): string {
  if (typeof args.path === "string") return args.path;
  if (typeof args.command === "string") return args.command.slice(0, 60);
  if (tool === "delegate" && typeof args.subagent_name === "string") return args.subagent_name;
  return toolLabel(tool);
}

const INITIAL_PHASE_GROUPS: PhaseGroup[] = [
  { phase: "planning", label: "Planning", status: "pending", steps: [] },
  { phase: "building", label: "Building", status: "pending", steps: [] },
  { phase: "testing", label: "Testing", status: "pending", steps: [] },
  { phase: "deploying", label: "Deploying", status: "pending", steps: [] },
  { phase: "integrating", label: "Integrating", status: "pending", steps: [] },
];

export function useAgentState() {
  const [state, setState] = useState<AgentState>({
    status: "idle",
    currentTool: null,
    currentFile: null,
    retryCount: 0,
    maxRetries: 3,
    retryReason: null,
    tokenUsage: null,
    model: null,
    lastError: null,
    isLoading: false,
  });

  const [phaseGroups, setPhaseGroups] = useState<PhaseGroup[]>(
    INITIAL_PHASE_GROUPS.map(g => ({ ...g, steps: [] }))
  );

  const processSignal = useCallback((signal: AgentSignal) => {
    setState(prev => {
      switch (signal.type) {
        case "agent.idle":
          return { ...prev, status: "idle", isLoading: false };
        case "agent.thinking":
          return { ...prev, status: "thinking", isLoading: true };
        case "agent.tool_call":
          return { ...prev, status: "executing", currentTool: signal.tool, isLoading: true };
        case "agent.tool_result":
          return { ...prev, isLoading: false };
        case "agent.retry":
          return { ...prev, status: "retrying", retryCount: signal.attempt, retryReason: signal.reason };
        case "agent.done":
          return { ...prev, status: "done", tokenUsage: signal.tokens, model: signal.model, isLoading: false, currentTool: null };
        case "agent.error":
          return { ...prev, status: "error", lastError: { message: signal.message, code: signal.code, recoverable: signal.recoverable }, isLoading: false };
        default:
          return prev;
      }
    });

    setPhaseGroups(prev => {
      const groups = prev.map(g => ({ ...g, steps: [...g.steps] }));

      const setPhaseStatus = (phase: PhaseKey, status: PhaseGroup["status"]) => {
        const g = groups.find(g => g.phase === phase);
        if (g) g.status = status;
      };

      if (signal.type === "agent.thinking" && signal.phase === "planning") {
        setPhaseStatus("planning", "active");
        return groups;
      }

      if (signal.type === "agent.tool_call") {
        const phase = toolPhase(signal.tool);
        setPhaseStatus(phase, "active");
        const g = groups.find(g => g.phase === phase);
        if (g) {
          (g as any)._pendingCall = { tool: signal.tool, args: signal.args, timestamp: Date.now() };
        }
        return groups;
      }

      if (signal.type === "agent.tool_result") {
        const phase = toolPhase(signal.tool);
        const g = groups.find(g => g.phase === phase);
        if (g) {
          const pending = (g as any)._pendingCall;
          const args = pending?.tool === signal.tool ? pending.args : {};
          const step: StepEntry = {
            id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            tool: signal.tool,
            label: toolLabel(signal.tool),
            summary: makeSummary(signal.tool, args),
            status: signal.success ? "success" : "error",
            timestamp: pending?.timestamp ?? Date.now(),
            errorMessage: signal.success ? undefined : `Tool failed after ${signal.duration_ms}ms`,
          };
          g.steps.push(step);
          if (!signal.success) {
            g.status = "error";
          }
          delete (g as any)._pendingCall;
        }
        return groups;
      }

      if (signal.type === "agent.done") {
        groups.forEach(g => {
          if (g.status === "active") g.status = "done";
        });
        const planning = groups.find(g => g.phase === "planning");
        if (planning && planning.steps.length === 0) {
          planning.steps.push({
            id: `step-done-${Date.now()}`,
            tool: "agent.done",
            label: "Agent finished",
            summary: signal.message.slice(0, 80),
            status: "success",
            timestamp: Date.now(),
          });
          planning.status = "done";
        }
        return groups;
      }

      if (signal.type === "agent.error") {
        groups.forEach(g => {
          if (g.status === "active") g.status = "error";
        });
        return groups;
      }

      return groups;
    });
  }, []);

  const reset = useCallback(() => {
    setState({
      status: "idle",
      currentTool: null,
      currentFile: null,
      retryCount: 0,
      maxRetries: 3,
      retryReason: null,
      tokenUsage: null,
      model: null,
      lastError: null,
      isLoading: false,
    });
    setPhaseGroups(INITIAL_PHASE_GROUPS.map(g => ({ ...g, steps: [] })));
  }, []);

  const clearSession = reset;

  const setDisconnected = useCallback((_message: string) => {}, []);

  const lastAction: StepEntry | null = (() => {
    const allSteps = phaseGroups.flatMap(g => g.steps);
    if (allSteps.length === 0) return null;
    return allSteps.reduce((latest, s) => s.timestamp > latest.timestamp ? s : latest);
  })();

  return { ...state, processSignal, reset, clearSession, setDisconnected, phaseGroups, lastAction };
}
