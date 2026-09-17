// Shared LangChain `tool(...)` wrapper around the StacyVM `bash` primitive.
// Lifted out of `smartContract/tools.ts` so SC, Frontend, and Integration
// agents can each scope the default cwd appropriately without duplicating the
// schema and result-stringification code.
import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { bash } from "../../tools/bash.ts";

function asJson(x: unknown): string {
  return typeof x === "string" ? x : JSON.stringify(x);
}

export interface BashToolOptions {
  /** Default cwd injected when the LLM doesn't specify one. */
  defaultCwd: string;
  /**
   * Human-readable hint appended to the tool description so the LLM understands
   * which scope it's in (e.g. "/workspace/contracts" or "/workspace/frontend").
   */
  scopeHint?: string;
}

export function buildBashTool(
  sandboxId: string,
  opts: BashToolOptions,
): StructuredToolInterface {
  const scope = opts.scopeHint ?? opts.defaultCwd;
  return tool(
    async ({ command, cwd, timeout }) => {
      const r = await bash(sandboxId, command, {
        cwd: cwd ?? opts.defaultCwd,
        timeout,
      });
      return asJson(r);
    },
    {
      name: "bash",
      description:
        `Run a shell command. Default cwd is ${opts.defaultCwd}. ` +
        `Use for greps, mkdir, env-sourcing, anything not covered by a dedicated tool. ` +
        `Stay within ${scope} unless the task explicitly needs another scope.`,
      schema: z.object({
        command: z.string(),
        cwd: z.string().optional().describe(`Override working directory (default: ${opts.defaultCwd})`),
        timeout: z.string().optional().describe("e.g. '30s', '2m'"),
      }),
    },
  );
}
