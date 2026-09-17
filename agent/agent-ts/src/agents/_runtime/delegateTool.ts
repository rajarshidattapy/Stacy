// Builds the LLM-callable `delegate` tool that the parent agent uses to
// invoke any of its registered subagents. We expose this instead of
// deepagents' built-in `task` tool because we need full control over the
// circuit breaker accounting and summary parsing.
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { runSubagent } from "./subagentRunner.ts";
import type { SubagentSpec } from "./types.ts";

export interface DelegateToolDeps {
  parentRunId: string;
  sandboxId: string;
  threadId: string;
  registry: Record<string, SubagentSpec>;   // name → spec
}

export function buildDelegateTool(deps: DelegateToolDeps) {
  const subagentNames = Object.keys(deps.registry);
  const summary = subagentNames
    .map((n) => `- ${n}: ${deps.registry[n].description}`)
    .join("\n");

  return tool(
    async (input) => {
      const spec = deps.registry[input.subagent_name];
      if (!spec) {
        return JSON.stringify({
          status: "failure",
          summary: `Unknown subagent "${input.subagent_name}". Available: ${subagentNames.join(", ")}`,
        });
      }
      const result = await runSubagent({
        spec,
        taskDescription: input.task_description,
        contextBundle: input.context ?? undefined,
        parentRunId: deps.parentRunId,
        sandboxId: deps.sandboxId,
        threadId: deps.threadId,
      });
      return JSON.stringify(result);
    },
    {
      name: "delegate",
      description:
        `Delegate a focused chunk of work to a registered subagent and wait for its structured summary. Available subagents:\n${summary}\n\nUse for tasks with a clear goal and an obvious owner. Do not use for trivial single-tool calls — call the tool directly.`,
      schema: z.object({
        subagent_name: z.enum(subagentNames as [string, ...string[]]).describe("The subagent to invoke."),
        task_description: z.string().min(8).describe(
          "A short paragraph describing what the subagent should do. Be specific — this is the only message it sees.",
        ),
        context: z.record(z.unknown()).optional().describe(
          "Optional small bundle of facts the subagent needs (e.g., file paths, contract names, the failing test name). Don't pass full message history.",
        ),
      }),
    },
  );
}
