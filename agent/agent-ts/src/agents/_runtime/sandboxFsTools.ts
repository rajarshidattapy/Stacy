// Shared LangChain `tool(...)` wrappers around the StacyVM filesystem
// primitives. Lifted out of `smartContract/tools.ts` so the Audit agent (and
// future agents) can build a read-only subset without duplicating the
// path-scoping plumbing.
//
// Tool names use a `sandbox_` prefix to avoid colliding with the deepagents
// built-in `read_file` / `write_file` / `ls` / `glob` / `grep` tools, which
// the agent uses to navigate the skills library.
import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "../../tools/filesystem.ts";
import { scopeTo } from "../../tools/pathScope.ts";

const DEFAULT_ROOT = "/workspace/contracts";

function asJson(x: unknown): string {
  return typeof x === "string" ? x : JSON.stringify(x);
}

export interface SandboxFsToolOptions {
  /** Roots the tools are allowed to touch. Defaults to ["/workspace/contracts"]. */
  roots?: string[];
}

/**
 * Full read/write/move/delete sandbox FS tool surface, scoped to `roots`.
 * Used by the SC agent.
 */
export function buildSandboxFsTools(
  sandboxId: string,
  opts: SandboxFsToolOptions = {},
): StructuredToolInterface[] {
  const roots = opts.roots ?? [DEFAULT_ROOT];
  const rootDescription = roots.join(", ");

  const scopedRead = scopeTo(roots)(fs.readFile);
  const scopedWrite = scopeTo(roots)(fs.writeFile);
  const scopedEdit = scopeTo(roots)(fs.editFile);
  const scopedList = scopeTo(roots)(fs.listDir);
  const scopedDelete = scopeTo(roots)(fs.deleteFile);
  const scopedMove = scopeTo(roots)(fs.moveFile);
  const scopedStat = scopeTo(roots)(fs.statFile);
  const scopedGlob = scopeTo(roots)(fs.globFiles);
  const scopedChmod = scopeTo(roots)(fs.chmodFile);

  return [
    tool(async ({ path }) => asJson(await scopedRead(sandboxId, { path })), {
      name: "sandbox_read",
      description:
        `Read a file from the user's project inside the StacyVM sandbox (under ${rootDescription}). ` +
        `Use the built-in \`read_file\` for skill docs instead. ` +
        `Returns { ok, data: { path, content } } or { ok: false, error }.`,
      schema: z.object({
        path: z.string().describe(`Absolute path under ${rootDescription}`),
      }),
    }),
    tool(async ({ path, content }) => asJson(await scopedWrite(sandboxId, { path, content })), {
      name: "sandbox_write",
      description:
        `Write or overwrite a file in the user's project inside the StacyVM sandbox (under ${rootDescription}). ` +
        `Use this — NOT the built-in \`write_file\` — for any path under ${rootDescription}. ` +
        `For small in-place changes, prefer \`sandbox_edit\` to avoid resending the whole file. ` +
        `Returns { ok, data: { path, bytes } } or { ok: false, error }.`,
      schema: z.object({
        path: z.string(),
        content: z.string(),
      }),
    }),
    tool(
      async ({ path, old_string, new_string, replace_all }) =>
        asJson(await scopedEdit(sandboxId, { path, old_string, new_string, replace_all })),
      {
        name: "sandbox_edit",
        description:
          `Exact-string replacement in a file inside the StacyVM sandbox (under ${rootDescription}). ` +
          `Use this — NOT the built-in \`edit_file\` — for any path under ${rootDescription}. ` +
          `\`edit_file\` targets the read-only skills library on the agent host and will return "permission denied" on sandbox paths. ` +
          `\`old_string\` must match exactly (including indentation and surrounding whitespace) and must be unique unless \`replace_all\` is true. ` +
          `Returns { ok, data: { path, replacements, bytes } } or { ok: false, error }.`,
        schema: z.object({
          path: z.string().describe(`Absolute path under ${rootDescription}`),
          old_string: z.string().describe("Exact substring to replace; must match the file byte-for-byte"),
          new_string: z.string().describe("Replacement text; must differ from old_string"),
          replace_all: z.boolean().default(false).describe("Replace every occurrence instead of requiring uniqueness"),
        }),
      },
    ),
    tool(async ({ path }) => asJson(await scopedList(sandboxId, { path })), {
      name: "sandbox_ls",
      description: `List a directory inside the StacyVM sandbox (under ${rootDescription}).`,
      schema: z.object({ path: z.string() }),
    }),
    tool(async ({ path, recursive }) => asJson(await scopedDelete(sandboxId, { path, recursive })), {
      name: "sandbox_delete",
      description: `Delete a file or directory inside the StacyVM sandbox (under ${rootDescription}).`,
      schema: z.object({ path: z.string(), recursive: z.boolean().default(false) }),
    }),
    tool(async ({ from, to }) => asJson(await scopedMove(sandboxId, { from, to })), {
      name: "sandbox_move",
      description: `Move/rename a file inside the StacyVM sandbox (under ${rootDescription}).`,
      schema: z.object({ from: z.string(), to: z.string() }),
    }),
    tool(async ({ path }) => asJson(await scopedStat(sandboxId, { path })), {
      name: "sandbox_stat",
      description: `Stat a file/dir inside the StacyVM sandbox (under ${rootDescription}).`,
      schema: z.object({ path: z.string() }),
    }),
    tool(async ({ pattern }) => asJson(await scopedGlob(sandboxId, { pattern })), {
      name: "sandbox_glob",
      description: `Glob match files inside the StacyVM sandbox (under ${rootDescription}). Uses path argument for scoping.`,
      schema: z.object({ pattern: z.string() }),
    }),
    tool(async ({ path, mode }) => asJson(await scopedChmod(sandboxId, { path, mode })), {
      name: "sandbox_chmod",
      description: `Change file permissions inside the StacyVM sandbox (under ${rootDescription}).`,
      schema: z.object({ path: z.string(), mode: z.string().describe("Octal mode string, e.g. '0755'") }),
    }),
  ];
}

/**
 * Read-only subset of the sandbox FS tools — `sandbox_read`, `sandbox_ls`,
 * `sandbox_stat` only. Used by the Audit agent so it cannot mutate user
 * source code while inspecting it.
 */
export function buildReadOnlySandboxFsTools(
  sandboxId: string,
  opts: SandboxFsToolOptions = {},
): StructuredToolInterface[] {
  const READ_ONLY = new Set(["sandbox_read", "sandbox_ls", "sandbox_stat"]);
  return buildSandboxFsTools(sandboxId, opts).filter((t) => READ_ONLY.has(t.name));
}
