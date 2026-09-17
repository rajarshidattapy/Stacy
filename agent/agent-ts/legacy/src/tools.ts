// Extra tools wired to a specific sandbox instance.
// deepagents already provides: ls, read_file, write_file, edit_file, glob, grep, execute
// via the backend. We add: whoami, exec_stream, web_search.
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { Sandbox } from "forgevm";

const MAX_STREAM_CHARS = 12_000;

export function buildExtraTools(sandbox: Sandbox) {
  const whoami = tool(
    async () =>
      JSON.stringify({
        sandbox_id: sandbox.id,
        image: sandbox.image,
        state: sandbox.state,
        provider: sandbox.provider,
        preview_url_3000: sandbox.getPreviewUrl(3000),
      }),
    {
      name: "whoami",
      description:
        "Return the active sandbox identity: {sandbox_id, image, state, provider, preview_url_3000}. Call this first to confirm which sandbox you are operating on.",
      schema: z.object({}),
    },
  );

  const sandboxListFiles = tool(
    async ({ path }) => {
      try {
        const files = await sandbox.listFiles(path);
        return JSON.stringify({ path, files });
      } catch (err) {
        return `[sandbox_list_files error] ${err}`;
      }
    },
    {
      name: "sandbox_list_files",
      description:
        "List files (non-recursive) using ForgeVM's native file API. Returns an array of file info objects including name/path/size/is_dir/mod_time/mode.",
      schema: z.object({
        path: z.string().default("/").describe("Directory path to list (absolute path)"),
      }),
    },
  );

  const sandboxReadFile = tool(
    async ({ path, max_chars, tail }) => {
      try {
        const content = await sandbox.readFile(path);
        const maxChars = Math.max(1, Math.min(max_chars ?? 20_000, 200_000));
        const truncated = content.length > maxChars;
        const snippet = truncated ? (tail ? content.slice(-maxChars) : content.slice(0, maxChars)) : content;
        return JSON.stringify({
          path,
          truncated,
          total_chars: content.length,
          content: snippet,
        });
      } catch (err) {
        return `[sandbox_read_file error] ${err}`;
      }
    },
    {
      name: "sandbox_read_file",
      description:
        "Read a whole file as UTF-8 text using ForgeVM's native file API (not paginated). Use read_file for paginated reads with line numbers.",
      schema: z.object({
        path: z.string().describe("Absolute file path to read"),
        max_chars: z.number().int().min(1).max(200_000).default(20_000).describe("Max characters to return"),
        tail: z.boolean().default(false).describe("Return the last max_chars instead of the first"),
      }),
    },
  );

  const sandboxWriteFile = tool(
    async ({ path, content, mode }) => {
      try {
        await sandbox.writeFile(path, content, mode);
        return JSON.stringify({ path, bytes: content.length, mode: mode ?? null });
      } catch (err) {
        return `[sandbox_write_file error] ${err}`;
      }
    },
    {
      name: "sandbox_write_file",
      description:
        "Write (overwrite) a file using ForgeVM's native file API. Unlike write_file, this does not enforce 'new file only'.",
      schema: z.object({
        path: z.string().describe("Absolute file path to write"),
        content: z.string().describe("Full UTF-8 content to write"),
        mode: z.string().optional().describe("Optional unix mode string, e.g. '0644'"),
      }),
    },
  );

  const sandboxMoveFile = tool(
    async ({ old_path, new_path }) => {
      try {
        await sandbox.moveFile(old_path, new_path);
        return JSON.stringify({ old_path, new_path, moved: true });
      } catch (err) {
        return `[sandbox_move_file error] ${err}`;
      }
    },
    {
      name: "sandbox_move_file",
      description: "Move/rename a file using ForgeVM's native file API.",
      schema: z.object({
        old_path: z.string().describe("Source absolute path"),
        new_path: z.string().describe("Destination absolute path"),
      }),
    },
  );

  const sandboxChmodFile = tool(
    async ({ path, mode }) => {
      try {
        await sandbox.chmodFile(path, mode);
        return JSON.stringify({ path, mode, ok: true });
      } catch (err) {
        return `[sandbox_chmod_file error] ${err}`;
      }
    },
    {
      name: "sandbox_chmod_file",
      description: "Change file permissions using ForgeVM's native file API.",
      schema: z.object({
        path: z.string().describe("Absolute path to chmod"),
        mode: z.string().describe("Octal mode string, e.g. '0755'"),
      }),
    },
  );

  const sandboxStatFile = tool(
    async ({ path }) => {
      try {
        const info = await sandbox.statFile(path);
        return JSON.stringify(info);
      } catch (err) {
        return `[sandbox_stat_file error] ${err}`;
      }
    },
    {
      name: "sandbox_stat_file",
      description: "Stat a file/directory using ForgeVM's native file API.",
      schema: z.object({
        path: z.string().describe("Absolute path to stat"),
      }),
    },
  );

  const sandboxGlobFiles = tool(
    async ({ pattern }) => {
      try {
        const matches = await sandbox.globFiles(pattern);
        return JSON.stringify({ pattern, matches });
      } catch (err) {
        return `[sandbox_glob_files error] ${err}`;
      }
    },
    {
      name: "sandbox_glob_files",
      description:
        "Return paths matching a glob pattern using ForgeVM's native glob endpoint. Note: this is provider/shell-style globbing and may not support recursive '**' patterns.",
      schema: z.object({
        pattern: z.string().describe("Glob pattern, typically an absolute path pattern like '/workspace/*.log'"),
      }),
    },
  );

  const sandboxDeleteFile = tool(
    async ({ path, recursive }) => {
      try {
        await sandbox.deleteFile(path, recursive);
        return JSON.stringify({ path, recursive: !!recursive, deleted: true });
      } catch (err) {
        return `[sandbox_delete_file error] ${err}`;
      }
    },
    {
      name: "sandbox_delete_file",
      description: "Delete a file (or directory with recursive=true) using ForgeVM's native file API.",
      schema: z.object({
        path: z.string().describe("Absolute path to delete"),
        recursive: z.boolean().default(false).describe("If true, delete directories recursively"),
      }),
    },
  );

  const sandboxRefresh = tool(
    async () => {
      try {
        await sandbox.refresh();
        return JSON.stringify({
          sandbox_id: sandbox.id,
          state: sandbox.state,
          image: sandbox.image,
          provider: sandbox.provider,
        });
      } catch (err) {
        return `[sandbox_refresh error] ${err}`;
      }
    },
    {
      name: "sandbox_refresh",
      description: "Refresh sandbox state/info from the server (ForgeVM native).",
      schema: z.object({}),
    },
  );

  const sandboxGetPreviewUrl = tool(
    async ({ port }) => {
      try {
        return JSON.stringify({ port, url: sandbox.getPreviewUrl(port) });
      } catch (err) {
        return `[sandbox_get_preview_url error] ${err}`;
      }
    },
    {
      name: "sandbox_get_preview_url",
      description: "Get a live preview URL for a given port (ForgeVM native).",
      schema: z.object({
        port: z.number().int().min(1).max(65535).describe("Internal port to expose (e.g. 3000)"),
      }),
    },
  );

  const sandboxDestroy = tool(
    async ({ confirm }) => {
      try {
        if (confirm !== "DESTROY") return "Refusing: confirm must be exactly 'DESTROY'.";
        await sandbox.destroy();
        return JSON.stringify({ sandbox_id: sandbox.id, destroyed: true });
      } catch (err) {
        return `[sandbox_destroy error] ${err}`;
      }
    },
    {
      name: "sandbox_destroy",
      description:
        "DANGEROUS: Destroy the current sandbox (irreversible). Only call when explicitly requested by the user.",
      schema: z.object({
        confirm: z.literal("DESTROY").describe("Safety check: must be exactly 'DESTROY'"),
      }),
    },
  );

  // Streaming exec: collects chunks in real-time, useful for long builds/installs.
  const execStream = tool(
    async ({ command }) => {
      try {
        const parts: string[] = [];
        for await (const chunk of sandbox.execStream(command)) {
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
        "Run a shell command with streaming output. Use for long-running operations (npm install, npm run build, test suites). Returns combined stdout/stderr after completion.",
      schema: z.object({
        command: z.string().describe("Shell command to stream"),
      }),
    },
  );

  const extendTtl = tool(
    async ({ ttl }) => {
      try {
        await sandbox.extendTtl(ttl);
        return `TTL extended by ${ttl}`;
      } catch (err) {
        return `[extend_ttl error] ${err}`;
      }
    },
    {
      name: "extend_ttl",
      description: "Extend the sandbox TTL to prevent expiry during long tasks.",
      schema: z.object({
        ttl: z.string().default("30m").describe("Duration string e.g. '30m', '1h'"),
      }),
    },
  );

  // Overwrites an existing file entirely, bypassing write_file's "already exists" guard.
  // Use when a full rewrite is cleaner than multiple edit_file calls.
  const overwriteFile = tool(
    async ({ file_path, content }) => {
      try {
        await sandbox.writeFile(file_path, content);
        return `overwritten: ${file_path}`;
      } catch (err) {
        return `[overwrite_file error] ${err}`;
      }
    },
    {
      name: "overwrite_file",
      description:
        "Fully replace the contents of an existing file. Use this when you need a complete rewrite instead of a targeted edit. For new files use write_file; for targeted changes use edit_file.",
      schema: z.object({
        file_path: z.string().describe("Absolute path to the file to overwrite"),
        content: z.string().describe("New full content of the file"),
      }),
    },
  );

  return [
    whoami,
    sandboxListFiles,
    sandboxReadFile,
    sandboxWriteFile,
    sandboxMoveFile,
    sandboxChmodFile,
    sandboxStatFile,
    sandboxGlobFiles,
    sandboxDeleteFile,
    sandboxRefresh,
    sandboxGetPreviewUrl,
    sandboxDestroy,
    execStream,
    extendTtl,
    overwriteFile,
  ];
}

export function buildWebSearchTool(apiKey: string) {
  return tool(
    async ({ query, maxResults = 5 }) => {
      try {
        const res = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: apiKey,
            query,
            max_results: maxResults,
            search_depth: "advanced",
            include_answer: true,
          }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) throw new Error(`Tavily HTTP ${res.status}: ${await res.text()}`);
        const data = (await res.json()) as {
          answer?: string;
          results?: Array<{ title: string; url: string; content: string }>;
        };
        const parts: string[] = [];
        if (data.answer) parts.push(`Answer: ${data.answer}`);
        for (const r of data.results?.slice(0, maxResults) ?? []) {
          parts.push(`\n---\n**${r.title}**\n${r.url}\n${r.content.slice(0, 500)}`);
        }
        return parts.join("\n") || "(no results)";
      } catch (err) {
        return `[web_search error] ${err}`;
      }
    },
    {
      name: "web_search",
      description:
        "Search the web for up-to-date docs, npm packages, error messages, API references. Use when information is not available inside the sandbox.",
      schema: z.object({
        query: z.string().describe("Search query"),
        maxResults: z.number().min(1).max(10).default(5).describe("Max results to return"),
      }),
    },
  );
}
