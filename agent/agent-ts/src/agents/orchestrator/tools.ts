import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { parsePrdToTodos } from "./kickoff.ts";
import { generateAgentsMdFiles } from "./agentsMdGenerator.ts";
import { writeFile } from "../../tools/filesystem.ts";
import { buildReadOnlySandboxFsTools, buildSandboxFsTools } from "../_runtime/sandboxFsTools.ts";

function asJson(x: unknown): string {
  return typeof x === "string" ? x : JSON.stringify(x);
}

export function buildAllOrchestratorTools(sandboxId: string): StructuredToolInterface[] {
  const READ_ONLY = new Set(["sandbox_read", "sandbox_ls", "sandbox_stat"]);
  const writeTools = buildSandboxFsTools(sandboxId, { 
    roots: ["/workspace/AGENTS.md", "/workspace/contracts/AGENTS.md", "/workspace/frontend/AGENTS.md", "/workspace/.agent"] 
  }).filter(t => !READ_ONLY.has(t.name));

  return [
    ...buildReadOnlySandboxFsTools(sandboxId, { roots: ["/workspace"] }),
    ...writeTools,
    tool(
      async ({ prdContent }) => {
        try {
          const todos = await parsePrdToTodos(prdContent);
          const agentsMd = await generateAgentsMdFiles(sandboxId, prdContent);
          
          await writeFile(sandboxId, {
            path: "/workspace/.agent/todos.json",
            content: JSON.stringify(todos, null, 2)
          });

          return asJson({ ok: true, data: { todos, agentsMdPaths: Object.keys(agentsMd) } });
        } catch (error) {
          return asJson({ ok: false, error: String(error) });
        }
      },
      {
        name: "kickoff_project",
        description: "Parses the PRD into a phased plan (todos.json) and generates AGENTS.md files. Call this at the start of orchestration.",
        schema: z.object({
          prdContent: z.string().describe("The full markdown content of the PRD to parse"),
        }),
      }
    ),
    tool(
      async ({ content }) => {
        try {
          await writeFile(sandboxId, {
            path: "/workspace/.agent/todos.json",
            content
          });
          return asJson({ ok: true });
        } catch (error) {
          return asJson({ ok: false, error: String(error) });
        }
      },
      {
        name: "update_project_todos",
        description: "Updates the /workspace/.agent/todos.json file. Use this to mark tasks as done.",
        schema: z.object({
          content: z.string().describe("The updated JSON string for the todos file"),
        }),
      }
    )
  ];
}
