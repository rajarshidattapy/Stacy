// LangChain tool wrappers for the Frontend agent. Mirrors the SC `tools.ts`
// pattern but scopes filesystem + bash to /workspace/frontend/ and exposes
// the bun_* + list_frontend_tree tool family.
//
// Tool name discipline (same as SC): `sandbox_*` for the user project,
// built-in `read_file`/`ls`/`glob`/`grep` for the skills library. The
// `bun_*` and `list_frontend_tree` names don't collide with deepagents
// builtins.
import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import * as bunTools from "../../tools/bun.ts";
import { buildSandboxFsTools } from "../_runtime/sandboxFsTools.ts";
import { buildBashTool as buildBashToolShared } from "../_runtime/sandboxBashTool.ts";
import { buildSandboxSystemTools } from "../_runtime/sandboxSystemTools.ts";

const FRONTEND_ROOT = "/workspace/frontend";

function asJson(x: unknown): string {
  return typeof x === "string" ? x : JSON.stringify(x);
}

// ── sandbox filesystem (scoped to /workspace/frontend/) ─────────────────────
export function buildFsTools(sandboxId: string): StructuredToolInterface[] {
  return buildSandboxFsTools(sandboxId, { roots: [FRONTEND_ROOT] });
}

// ── bash (cwd defaults to /workspace/frontend) ──────────────────────────────
export function buildBashTool(sandboxId: string): StructuredToolInterface {
  return buildBashToolShared(sandboxId, { defaultCwd: FRONTEND_ROOT });
}

// ── bun_* + list_frontend_tree ──────────────────────────────────────────────
export function buildBunTools(sandboxId: string): StructuredToolInterface[] {
  return [
    tool(async (args) => asJson(await bunTools.bunInstall(sandboxId, args)), {
      name: "bun_install",
      description:
        "Run `bun install` in the frontend project. Returns { success, added, warnings, raw }. " +
        "Use when package.json has changed or node_modules is missing.",
      schema: z.object({
        cwd: z.string().optional().describe(`Override project root (default: ${FRONTEND_ROOT})`),
      }),
    }),
    tool(async (args) => asJson(await bunTools.bunRunBuild(sandboxId, args)), {
      name: "bun_run_build",
      description:
        "Run `bun run build`. Returns { success, errors, warnings, raw }. " +
        "Always run before considering the frontend done.",
      schema: z.object({
        cwd: z.string().optional(),
      }),
    }),
    tool(async (args) => asJson(await bunTools.bunRunLint(sandboxId, args)), {
      name: "bun_run_lint",
      description:
        "Run `bun run lint`. Returns { success, issues: [{file, line, rule, message}], raw }.",
      schema: z.object({
        cwd: z.string().optional(),
      }),
    }),
    tool(async (args) => asJson(await bunTools.bunDevSmoke(sandboxId, args)), {
      name: "bun_dev_smoke",
      description:
        "Boot `bun dev` in the background, GET http://localhost:<port>/, kill the server, return whether it served 200. " +
        "Default port 3000 (Next.js). Default timeout 15s. Use after building components to verify the dev server starts cleanly.",
      schema: z.object({
        cwd: z.string().optional(),
        port: z.number().int().optional().describe("Default 3000 (Next.js dev server)"),
        timeoutMs: z.number().int().optional().describe("Default 15000ms"),
      }),
    }),
    tool(async (args) => asJson(await bunTools.listFrontendTree(sandboxId, args)), {
      name: "list_frontend_tree",
      description:
        "Walk the frontend project, ignoring node_modules / .next / .git / dist / out / .turbo. " +
        "Returns a structured tree useful for planning component locations.",
      schema: z.object({
        cwd: z.string().optional(),
        maxDepth: z.number().int().optional().describe("Default 6"),
      }),
    }),
  ];
}

export function buildAllFeTools(sandboxId: string): StructuredToolInterface[] {
  return [
    ...buildSandboxSystemTools(sandboxId),
    ...buildFsTools(sandboxId),
    buildBashTool(sandboxId),
    ...buildBunTools(sandboxId),
  ];
}
