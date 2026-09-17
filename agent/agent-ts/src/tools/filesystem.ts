// Filesystem primitives. Every function takes (sandboxId, args) and returns
// a Result. Nothing throws.
import type { FileInfo } from "stacyvm";
import { getSandbox } from "./stacyvmClient.ts";
import { fromThrowable, type Result } from "./result.ts";

export interface ReadFileArgs { path: string }
export interface WriteFileArgs { path: string; content: string; mode?: string }
export interface ListDirArgs { path: string }
export interface DeleteFileArgs { path: string; recursive?: boolean }
export interface MoveFileArgs { from: string; to: string }
export interface GlobFilesArgs { pattern: string }
export interface StatFileArgs { path: string }
export interface ChmodFileArgs { path: string; mode: string }
export interface EditFileArgs { path: string; old_string: string; new_string: string; replace_all?: boolean }

export async function readFile(sandboxId: string, args: ReadFileArgs): Promise<Result<{ path: string; content: string }>> {
  return fromThrowable(async () => {
    const sb = await getSandbox(sandboxId);
    const content = await sb.readFile(args.path);
    return { path: args.path, content };
  }, "READ_FAILED");
}

export async function writeFile(sandboxId: string, args: WriteFileArgs): Promise<Result<{ path: string; bytes: number }>> {
  return fromThrowable(async () => {
    const sb = await getSandbox(sandboxId);
    await sb.writeFile(args.path, args.content, args.mode);
    return { path: args.path, bytes: args.content.length };
  }, "WRITE_FAILED");
}

export async function listDir(sandboxId: string, args: ListDirArgs): Promise<Result<{ path: string; entries: FileInfo[] }>> {
  return fromThrowable(async () => {
    const sb = await getSandbox(sandboxId);
    const entries = await sb.listFiles(args.path);
    return { path: args.path, entries };
  }, "LIST_FAILED");
}

export async function deleteFile(sandboxId: string, args: DeleteFileArgs): Promise<Result<{ path: string }>> {
  return fromThrowable(async () => {
    const sb = await getSandbox(sandboxId);
    await sb.deleteFile(args.path, args.recursive);
    return { path: args.path };
  }, "DELETE_FAILED");
}

export async function moveFile(sandboxId: string, args: MoveFileArgs): Promise<Result<{ from: string; to: string }>> {
  return fromThrowable(async () => {
    const sb = await getSandbox(sandboxId);
    await sb.moveFile(args.from, args.to);
    return { from: args.from, to: args.to };
  }, "MOVE_FAILED");
}

export async function globFiles(sandboxId: string, args: GlobFilesArgs): Promise<Result<{ pattern: string; matches: string[] }>> {
  return fromThrowable(async () => {
    const sb = await getSandbox(sandboxId);
    const matches = await sb.globFiles(args.pattern);
    return { pattern: args.pattern, matches };
  }, "GLOB_FAILED");
}

export async function statFile(sandboxId: string, args: StatFileArgs): Promise<Result<FileInfo>> {
  return fromThrowable(async () => {
    const sb = await getSandbox(sandboxId);
    return await sb.statFile(args.path);
  }, "STAT_FAILED");
}

export async function chmodFile(sandboxId: string, args: ChmodFileArgs): Promise<Result<{ path: string; mode: string }>> {
  return fromThrowable(async () => {
    const sb = await getSandbox(sandboxId);
    await sb.chmodFile(args.path, args.mode);
    return { path: args.path, mode: args.mode };
  }, "CHMOD_FAILED");
}

// Exact-string replacement primitive. Reads the file, validates the match, and
// writes the new content. Mirrors Claude Code's `Edit` tool semantics:
//   - `old_string` must appear at least once
//   - if it appears more than once, `replace_all` is required
//   - `old_string` !== `new_string`
export async function editFile(
  sandboxId: string,
  args: EditFileArgs,
): Promise<Result<{ path: string; replacements: number; bytes: number }>> {
  return fromThrowable(async () => {
    if (args.old_string === args.new_string) {
      throw new Error("old_string and new_string must differ");
    }
    const sb = await getSandbox(sandboxId);
    const content = await sb.readFile(args.path);
    const occurrences = args.old_string.length === 0
      ? 0
      : content.split(args.old_string).length - 1;
    if (occurrences === 0) {
      throw new Error("old_string not found in file");
    }
    if (occurrences > 1 && !args.replace_all) {
      throw new Error(
        `old_string is not unique (matched ${occurrences} times); ` +
        `pass replace_all=true or expand the surrounding context to make it unique`,
      );
    }
    const next = args.replace_all
      ? content.split(args.old_string).join(args.new_string)
      : content.replace(args.old_string, args.new_string);
    await sb.writeFile(args.path, next);
    return {
      path: args.path,
      replacements: args.replace_all ? occurrences : 1,
      bytes: next.length,
    };
  }, "EDIT_FAILED");
}
