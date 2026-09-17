// Path-scoping wrapper. Wraps a tool function so that any path argument
// outside the allowed roots returns a structured error instead of executing.
//
// "Outside" is determined after POSIX normalisation (resolving "..").
import { posix } from "node:path";
import { err, type Result } from "./result.ts";

const PATH_KEYS = new Set(["path", "from", "to", "file_path", "old_path", "new_path"]);

function normalize(p: string): string {
  if (!p.startsWith("/")) return posix.normalize(p);
  return posix.normalize(p);
}

function isWithin(target: string, root: string): boolean {
  const t = normalize(target);
  const r = normalize(root.endsWith("/") ? root.slice(0, -1) : root);
  if (t === r) return true;
  return t.startsWith(r + "/");
}

export function isPathAllowed(path: string, allowedRoots: string[]): boolean {
  const norm = normalize(path);
  if (norm.includes("\0")) return false;
  return allowedRoots.some((root) => isWithin(norm, root));
}

export function violatesScope(args: Record<string, unknown>, allowedRoots: string[]): string | null {
  for (const [k, v] of Object.entries(args)) {
    if (!PATH_KEYS.has(k) || typeof v !== "string") continue;
    if (!isPathAllowed(v, allowedRoots)) {
      return `Path "${v}" is outside the allowed scope (${allowedRoots.join(", ")})`;
    }
  }
  return null;
}

// Higher-order wrapper for tool functions of the shape
//   (sandboxId, args) => Promise<Result<T>>
export function scopeTo(allowedRoots: string[]) {
  return function wrap<TArgs extends object, TOut>(
    fn: (sandboxId: string, args: TArgs) => Promise<Result<TOut>>,
  ): (sandboxId: string, args: TArgs) => Promise<Result<TOut>> {
    return async (sandboxId, args) => {
      const violation = violatesScope(args as Record<string, unknown>, allowedRoots);
      if (violation) return err(violation, "PATH_OUT_OF_SCOPE");
      return fn(sandboxId, args);
    };
  };
}
