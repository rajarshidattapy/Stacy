// Shared types for the agent runtime layer.
//
// SubagentSpec is the static description of a subagent: prompt, tool factory,
// model profile, run-time caps. The runner uses this to build a fresh agent
// instance per delegation.
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { ProfileName } from "../../models/profiles.ts";

export interface SubagentSpec {
  name: string;
  description: string;        // shown to the parent LLM so it can pick this subagent
  systemPrompt: string | ((sandboxId: string, context?: unknown) => Promise<string>);
  buildTools: (sandboxId: string, parentRunId?: string, threadId?: string) => StructuredToolInterface[];
  profile: ProfileName;
  maxLLMCalls?: number;       // recursion limit. default 12.
}

export type SubagentStatus = "success" | "failure" | "partial" | "circuit_open";

// Distinguishes "the operation itself failed" from "the orchestration framework
// crashed before we could be sure". This matters most for irreversible actions
// like on-chain deploys: an `operation` failure means retry is appropriate; an
// `orchestration` failure means the work may have already succeeded and a
// blind retry could double-spend / overwrite state. The parent's prompt is
// instructed to verify on-chain state before retrying on orchestration faults.
export type FailureKind = "operation" | "orchestration";

export interface SubagentSummary {
  status: SubagentStatus;
  summary: string;
  artifacts?: Record<string, unknown>;
  nextSteps?: string[];
  // Populated by the runner, not the subagent.
  attempts?: SubagentSummary[];   // for circuit_open: prior attempt summaries
  durationMs?: number;
  subagentName?: string;
  // Only set when status is "failure" or "partial"; tells the parent whether
  // a retry is safe.
  failureKind?: FailureKind;
}

export interface RunSubagentArgs {
  spec: SubagentSpec;
  taskDescription: string;
  contextBundle?: Record<string, unknown>;
  parentRunId: string;
  sandboxId: string;
  threadId: string;
}
