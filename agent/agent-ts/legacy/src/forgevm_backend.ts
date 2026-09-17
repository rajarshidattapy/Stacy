// ForgeVM backend for deepagents.
//
// Wraps a forgevm.Sandbox so deepagents' built-in tools (ls, read_file,
// write_file, edit_file, glob, grep, execute) run inside the real container.
//
// deepagents' BaseSandbox can derive file operations via shell commands through
// execute(), but ForgeVM already exposes native file APIs (listFiles/readFile/etc).
// We override those methods to reduce shelling out for common file operations.
import {
  BaseSandbox,
  type ExecuteResponse,
  type FileDownloadResponse,
  type FileInfo,
  type FileUploadResponse,
  type GlobResult,
  type GrepMatch,
  type GrepResult,
  type LsResult,
  type ReadResult,
} from "deepagents";
import type { FileInfo as ForgeFileInfo, Sandbox } from "forgevm";

const MAX_OUTPUT_CHARS = 12_000;
const EMPTY_CONTENT_WARNING = "System reminder: File exists but has empty contents";
const SKIP_DIR_NAMES = new Set(["node_modules", ".git", ".next"]);

function globToPathRegex(pattern: string): RegExp {
  let regex = "^";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "*") {
      if (i + 1 < pattern.length && pattern[i + 1] === "*") {
        i += 2;
        if (i < pattern.length && pattern[i] === "/") {
          regex += "(.*/)?";
          i++;
        } else {
          regex += ".*";
        }
      } else {
        regex += "[^/]*";
        i++;
      }
    } else if (c === "?") {
      regex += "[^/]";
      i++;
    } else if (c === "[") {
      let j = i + 1;
      while (j < pattern.length && pattern[j] !== "]") j++;
      regex += pattern.slice(i, j + 1);
      i = j + 1;
    } else if (c === "." || c === "+" || c === "^" || c === "$" || c === "{" || c === "}" || c === "(" || c === ")" || c === "|" || c === "\\") {
      regex += `\\${c}`;
      i++;
    } else {
      regex += c;
      i++;
    }
  }
  regex += "$";
  return new RegExp(regex);
}

export class ForgeVMSandboxBackend extends BaseSandbox {
  private readonly sandbox: Sandbox;
  private readonly defaultTimeout: number;

  constructor(sandbox: Sandbox, defaultTimeoutSeconds = 120) {
    super();
    this.sandbox = sandbox;
    this.defaultTimeout = defaultTimeoutSeconds;
  }

  get id(): string {
    return this.sandbox.id;
  }

  private toDeepagentsFileInfo(fi: ForgeFileInfo, opts?: { trailingSlashForDirs?: boolean }): FileInfo {
    const trailingSlashForDirs = opts?.trailingSlashForDirs ?? false;
    const path = fi.is_dir && trailingSlashForDirs && !fi.path.endsWith("/") ? `${fi.path}/` : fi.path;
    return {
      path,
      is_dir: fi.is_dir,
      size: fi.size,
      modified_at: fi.mod_time,
    };
  }

  private async listFilesRecursive(basePath: string): Promise<ForgeFileInfo[]> {
    const pending: string[] = [basePath];
    const results: ForgeFileInfo[] = [];

    while (pending.length) {
      const dirPath = pending.pop();
      if (!dirPath) break;

      let entries: ForgeFileInfo[] = [];
      try {
        entries = await this.sandbox.listFiles(dirPath);
      } catch {
        continue;
      }

      for (const entry of entries) {
        results.push(entry);
        if (entry.is_dir && !SKIP_DIR_NAMES.has(entry.name)) {
          pending.push(entry.path);
        }
      }
    }

    return results;
  }

  async execute(command: string): Promise<ExecuteResponse> {
    try {
      const result = await this.sandbox.exec(command, {
        timeout: `${this.defaultTimeout}s`,
      });
      let output = (result.stdout ?? "") + (result.stderr ?? "");
      let truncated = false;
      if (output.length > MAX_OUTPUT_CHARS) {
        output = output.slice(0, MAX_OUTPUT_CHARS) + `\n... [truncated, total ${output.length} chars]`;
        truncated = true;
      }
      return { output, exitCode: result.exit_code, truncated };
    } catch (err) {
      return { output: `[forgevm error] ${err}`, exitCode: -1, truncated: false };
    }
  }

  async ls(path: string): Promise<LsResult> {
    try {
      const entries = await this.sandbox.listFiles(path);
      const files = entries
        .map((fi) => this.toDeepagentsFileInfo(fi, { trailingSlashForDirs: true }))
        .sort((a, b) => a.path.localeCompare(b.path));
      return { files };
    } catch {
      return { files: [] };
    }
  }

  async read(filePath: string, offset = 0, limit = 500): Promise<ReadResult> {
    try {
      const raw = await this.sandbox.readFile(filePath);
      if (!raw.length) {
        return { content: EMPTY_CONTENT_WARNING, mimeType: "text/plain" };
      }

      let lines = raw.split("\n");
      // Avoid an extra trailing empty line when the file ends with "\n".
      if (raw.endsWith("\n")) lines = lines.slice(0, -1);

      const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
      const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 500;
      const slice = lines.slice(safeOffset, safeOffset + safeLimit);

      const formatted = slice
        .map((line, i) => `${String(safeOffset + i + 1).padStart(6, " ")}\t${line}`)
        .join("\n");

      return { content: formatted, mimeType: "text/plain" };
    } catch {
      return { error: `File '${filePath}' not found` };
    }
  }

  async glob(pattern: string, path: string = "/"): Promise<GlobResult> {
    try {
      const regex = globToPathRegex(pattern);
      const basePath = path.endsWith("/") ? path.slice(0, -1) : path;
      const entries = await this.listFilesRecursive(path);
      const files: FileInfo[] = [];

      for (const entry of entries) {
        const relPath = entry.path.startsWith(basePath + "/") ? entry.path.slice(basePath.length + 1) : entry.path;
        if (!regex.test(relPath)) continue;
        files.push({
          path: relPath,
          is_dir: entry.is_dir,
          size: entry.size,
          modified_at: entry.mod_time,
        });
      }

      files.sort((a, b) => a.path.localeCompare(b.path));
      return { files };
    } catch {
      return { files: [] };
    }
  }

  async grep(pattern: string, path: string = "/", glob: string | null = null): Promise<GrepResult> {
    try {
      let target: ForgeFileInfo | null = null;
      try {
        target = await this.sandbox.statFile(path);
      } catch {
        return { matches: [] };
      }

      let candidates: ForgeFileInfo[] = [];
      if (target && !target.is_dir) {
        candidates = [target];
      } else {
        candidates = await this.listFilesRecursive(path);
      }

      const nameRegex = glob ? globToPathRegex(glob) : null;
      const matches: GrepMatch[] = [];

      for (const entry of candidates) {
        if (entry.is_dir) continue;
        if (nameRegex && !nameRegex.test(entry.name)) continue;

        let raw = "";
        try {
          raw = await this.sandbox.readFile(entry.path);
        } catch {
          continue;
        }

        if (!raw.length) continue;
        let lines = raw.split("\n");
        if (raw.endsWith("\n")) lines = lines.slice(0, -1);

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i] ?? "";
          if (!line.includes(pattern)) continue;
          matches.push({ path: entry.path, line: i + 1, text: line });
        }
      }

      return { matches };
    } catch {
      return { matches: [] };
    }
  }

  async uploadFiles(files: Array<[string, Uint8Array]>): Promise<FileUploadResponse[]> {
    const results: FileUploadResponse[] = [];
    for (const [path, data] of files) {
      try {
        const content = new TextDecoder("utf-8", { fatal: false }).decode(data);
        await this.sandbox.writeFile(path, content);
        results.push({ path, error: null });
      } catch {
        results.push({ path, error: "file_not_found" });
      }
    }
    return results;
  }

  async downloadFiles(paths: string[]): Promise<FileDownloadResponse[]> {
    const results: FileDownloadResponse[] = [];
    for (const path of paths) {
      try {
        const content = await this.sandbox.readFile(path);
        results.push({ path, content: new TextEncoder().encode(content), error: null });
      } catch {
        results.push({ path, content: null, error: "file_not_found" });
      }
    }
    return results;
  }
}
