import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { getSandbox } from "../../tools/stacyvmClient.ts";

const MAX_STREAM_CHARS = 12_000;

function asJson(x: unknown): string {
  return typeof x === "string" ? x : JSON.stringify(x);
}

export function buildSandboxSystemTools(sandboxId: string): StructuredToolInterface[] {
  // const whoami = tool(
  //   async () => {
  //     const sandbox = await getSandbox(sandboxId);
  //     return asJson({
  //       sandbox_id: sandbox.id,
  //       image: sandbox.image,
  //       state: sandbox.state,
  //       provider: sandbox.provider,
  //       preview_url_3000: sandbox.getPreviewUrl(3000),
  //     });
  //   },
  //   {
  //     name: "whoami",
  //     description:
  //       "Return the active sandbox identity: {sandbox_id, image, state, provider, preview_url_3000}. Call this first to confirm which sandbox you are operating on.",
  //     schema: z.object({}),
  //   }
  // );

  // const sandboxGetPreviewUrl = tool(
  //   async ({ port }) => {
  //     try {
  //       const sandbox = await getSandbox(sandboxId);
  //       return asJson({ port, url: sandbox.getPreviewUrl(port) });
  //     } catch (err) {
  //       return `[sandbox_get_preview_url error] ${err}`;
  //     }
  //   },
  //   {
  //     name: "sandbox_get_preview_url",
  //     description: "Get a live preview URL for a given port (StacyVM native).",
  //     schema: z.object({
  //       port: z.number().int().min(1).max(65535).describe("Internal port to expose (e.g. 3000)"),
  //     }),
  //   }
  // );

  // const sandboxRefresh = tool(
  //   async () => {
  //     try {
  //       const sandbox = await getSandbox(sandboxId);
  //       await sandbox.refresh();
  //       return asJson({
  //         sandbox_id: sandbox.id,
  //         state: sandbox.state,
  //         image: sandbox.image,
  //         provider: sandbox.provider,
  //       });
  //     } catch (err) {
  //       return `[sandbox_refresh error] ${err}`;
  //     }
  //   },
  //   {
  //     name: "sandbox_refresh",
  //     description: "Refresh sandbox state/info from the server (StacyVM native).",
  //     schema: z.object({}),
  //   }
  // );

  // const extendTtl = tool(
  //   async ({ ttl }) => {
  //     try {
  //       const sandbox = await getSandbox(sandboxId);
  //       await sandbox.extendTtl(ttl);
  //       return `TTL extended by ${ttl}`;
  //     } catch (err) {
  //       return `[extend_ttl error] ${err}`;
  //     }
  //   },
  //   {
  //     name: "extend_ttl",
  //     description: "Extend the sandbox TTL to prevent expiry during long tasks.",
  //     schema: z.object({
  //       ttl: z.string().default("30m").describe("Duration string e.g. '30m', '1h'"),
  //     }),
  //   }
  // );

  const execStream = tool(
    async ({ command, cwd, env }) => {
      try {
        const sandbox = await getSandbox(sandboxId);
        const parts: string[] = [];
        const opts = { workdir: cwd, env };
        for await (const chunk of sandbox.execStream(command, opts)) {
          parts.push(`[${chunk.stream}] ${chunk.data}`);
        }
        const output = parts.join("").slice(-MAX_STREAM_CHARS);
        return output || "(no output)";
      } catch (err) {
        return `[exec_stream error] ${err}`;
      }
    },
    {
      name: "exec_stream",
      description:
        "Run an async shell command with streaming output. Use for long-running operations (bun install, bun run build, test suites). Avoids timeouts by streaming. Returns combined stdout/stderr after completion.",
      schema: z.object({
        command: z.string().describe("Shell command to stream"),
        cwd: z.string().optional().describe("Working directory"),
        env: z.record(z.string()).optional().describe("Environment variables"),
      }),
    }
  );

  const overwriteFile = tool(
    async ({ file_path, content }) => {
      try {
        const sandbox = await getSandbox(sandboxId);
        await sandbox.writeFile(file_path, content);
        return `overwritten: ${file_path}`;
      } catch (err) {
        return `[overwrite_file error] ${err}`;
      }
    },
    {
      name: "overwrite_file",
      description:
        "Fully replace the contents of an existing file. Use this when you need a complete rewrite instead of a targeted edit. For new files use sandbox_write; for targeted changes use sandbox_edit.",
      schema: z.object({
        file_path: z.string().describe("Absolute path to the file to overwrite"),
        content: z.string().describe("New full content of the file"),
      }),
    }
  );

  // const sandboxDestroy = tool(
  //   async ({ confirm }) => {
  //     try {
  //       if (confirm !== "DESTROY") return "Refusing: confirm must be exactly 'DESTROY'.";
  //       const sandbox = await getSandbox(sandboxId);
  //       await sandbox.destroy();
  //       return asJson({ sandbox_id: sandbox.id, destroyed: true });
  //     } catch (err) {
  //       return `[sandbox_destroy error] ${err}`;
  //     }
  //   },
  //   {
  //     name: "sandbox_destroy",
  //     description:
  //       "DANGEROUS: Destroy the current sandbox (irreversible). Only call when explicitly requested by the user.",
  //     schema: z.object({
  //       confirm: z.literal("DESTROY").describe("Safety check: must be exactly 'DESTROY'"),
  //     }),
  //   }
  // );

  const applyPatch = tool(
    async ({ patch, cwd }) => {
      try {
        const sandbox = await getSandbox(sandboxId);
        const patchPath = `/tmp/agent-patch-${Math.random().toString(36).slice(2)}.diff`;
        await sandbox.writeFile(patchPath, patch);
        const result = await sandbox.exec(`git apply ${patchPath}`, { workdir: cwd ?? "/workspace" });
        return asJson({
          ok: result.exit_code === 0,
          exitCode: result.exit_code,
          stdout: result.stdout,
          stderr: result.stderr
        });
      } catch (err) {
        return `[apply_patch error] ${err}`;
      }
    },
    {
      name: "apply_patch",
      description: "Apply a unified diff patch inside the sandbox using `git apply`. Useful for multi-file edits or complex changes.",
      schema: z.object({
        patch: z.string().describe("The unified diff patch string"),
        cwd: z.string().optional().describe("Working directory, defaults to /workspace"),
      }),
    }
  );

  const sandboxReadLines = tool(
    async ({ file_path, start_line, end_line }) => {
      try {
        const sandbox = await getSandbox(sandboxId);
        const content = await sandbox.readFile(file_path);
        const lines = content.split('\n');
        
        // 1-indexed lines
        const start = Math.max(1, start_line) - 1;
        const end = end_line ? Math.min(lines.length, end_line) : lines.length;
        
        const slice = lines.slice(start, end);
        const formatted = slice.map((line, i) => `${String(start + i + 1).padStart(6, " ")}\t${line}`).join("\n");
        return asJson({ file_path, lines: slice.length, content: formatted });
      } catch (err) {
        return `[sandbox_read_lines error] ${err}`;
      }
    },
    {
      name: "sandbox_read_lines",
      description: "Read a specific range of lines from a file in the sandbox. Line numbers are 1-indexed.",
      schema: z.object({
        file_path: z.string().describe("Absolute path to the file"),
        start_line: z.number().int().min(1).describe("Starting line number (1-indexed)"),
        end_line: z.number().int().optional().describe("Ending line number (inclusive)"),
      }),
    }
  );

  const sandboxGrep = tool(
    async ({ pattern, path, glob_pattern }) => {
      try {
        const sandbox = await getSandbox(sandboxId);
        const cmd = ["grep", "-rn", "-e", `"${pattern.replace(/"/g, '\\"')}"`];
        if (glob_pattern) {
          cmd.push("--include", `"${glob_pattern}"`);
        }
        cmd.push(`"${path}"`);
        
        const result = await sandbox.exec(cmd.join(" "), { timeout: "60s" });
        return asJson({
          ok: result.exit_code === 0,
          exitCode: result.exit_code,
          stdout: result.stdout,
          stderr: result.stderr
        });
      } catch (err) {
        return `[sandbox_grep error] ${err}`;
      }
    },
    {
      name: "sandbox_grep",
      description: "Search for a regex pattern in files using grep.",
      schema: z.object({
        pattern: z.string().describe("The regex pattern to search for"),
        path: z.string().default("/workspace").describe("Directory or file path to search in"),
        glob_pattern: z.string().optional().describe("Glob pattern to filter files (e.g. '*.ts')"),
      }),
    }
  );

  return [execStream, overwriteFile, applyPatch, sandboxReadLines, sandboxGrep];
}
