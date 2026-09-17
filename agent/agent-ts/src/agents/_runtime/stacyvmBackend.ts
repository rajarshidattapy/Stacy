import {
  BaseSandbox,
  type ExecuteResponse,
  type FileDownloadResponse,
  type FileInfo as DeepAgentsFileInfo,
  type FileUploadResponse,
  type GlobResult,
  type GrepMatch,
  type GrepResult,
  type LsResult,
  type ReadResult,
} from "deepagents";
import type { Sandbox, FileInfo as StacyFileInfo } from "stacyvm";

const MAX_OUTPUT_CHARS = 12_000;
const EMPTY_CONTENT_WARNING = "System reminder: File exists but has empty contents";
const SKIP_DIR_NAMES = new Set(["node_modules", ".git", ".next", "out", "dist"]);

export class StacyvmBackend extends BaseSandbox {
  private readonly sandbox: Sandbox;
  private readonly defaultTimeoutSeconds: number;

  constructor(sandbox: Sandbox, defaultTimeoutSeconds = 120) {
    super();
    this.sandbox = sandbox;
    this.defaultTimeoutSeconds = defaultTimeoutSeconds;
  }

  get id(): string {
    return this.sandbox.id;
  }

  private toDeepAgentsFileInfo(fi: StacyFileInfo, opts?: { trailingSlashForDirs?: boolean }): DeepAgentsFileInfo {
    const trailingSlashForDirs = opts?.trailingSlashForDirs ?? false;
    const path = fi.is_dir && trailingSlashForDirs && !fi.path.endsWith("/") ? `${fi.path}/` : fi.path;
    return {
      path,
      is_dir: fi.is_dir,
      size: fi.size,
      modified_at: fi.mod_time,
    };
  }

  async execute(command: string): Promise<ExecuteResponse> {
    try {
      const result = await this.sandbox.exec(command, {
        timeout: `${this.defaultTimeoutSeconds}s`,
      });
      let output = (result.stdout ?? "") + (result.stderr ?? "");
      let truncated = false;
      if (output.length > MAX_OUTPUT_CHARS) {
        output = output.slice(0, MAX_OUTPUT_CHARS) + `\n... [truncated, total ${output.length} chars]`;
        truncated = true;
      }
      return { output, exitCode: result.exit_code, truncated };
    } catch (err) {
      return { output: `[stacyvm error] ${err}`, exitCode: -1, truncated: false };
    }
  }

  override async ls(path: string): Promise<LsResult> {
    try {
      const entries = await this.sandbox.listFiles(path);
      const files = entries
        .map((fi) => this.toDeepAgentsFileInfo(fi, { trailingSlashForDirs: true }))
        .sort((a, b) => a.path.localeCompare(b.path));
      return { files };
    } catch (err) {
      return { files: [] };
    }
  }

  override async read(filePath: string, offset = 0, limit = 500): Promise<ReadResult> {
    try {
      const raw = await this.sandbox.readFile(filePath);
      if (!raw.length) {
        return { content: EMPTY_CONTENT_WARNING, mimeType: "text/plain" };
      }

      let lines = raw.split("\n");
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

  override async glob(pattern: string, path: string = "/"): Promise<GlobResult> {
    try {
      // StacyVM has native glob support now!
      // But it takes a single pattern. If we need to prepend path, we do:
      const fullPattern = pattern.startsWith("/") ? pattern : `${path.endsWith("/") ? path : path + "/"}${pattern}`;
      const matchedPaths = await this.sandbox.globFiles(fullPattern);

      const files: DeepAgentsFileInfo[] = [];
      for (const p of matchedPaths) {
        try {
          const stat = await this.sandbox.statFile(p);
          files.push(this.toDeepAgentsFileInfo(stat));
        } catch {
          // Ignore files that disappear between glob and stat
        }
      }

      files.sort((a, b) => a.path.localeCompare(b.path));
      return { files };
    } catch {
      return { files: [] };
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
