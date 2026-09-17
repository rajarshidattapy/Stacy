// Workspace helpers for the IDE: path scoping, file-tree listing and the
// sandbox's Next.js dev server. All paths the IDE sends are relative to
// /workspace (e.g. "contracts/src/Counter.sol", "frontend/app/page.tsx").
import type { Sandbox } from "stacyvm";

export const WORKSPACE_ROOT = "/workspace";
export const PREVIEW_PORT = 3000;

// Directories that are huge or generated. Listing them would flood the tree.
const PRUNED_DIRS = [
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  ".cache",
  "cache",
  "out",
  "broadcast",
];
const PRUNED_PATHS = ["./contracts/lib"];

export class PathError extends Error {}

/** Map an IDE-relative path to an absolute sandbox path, rejecting escapes. */
export function toSandboxPath(relPath: string): string {
  const parts = relPath.replace(/\\/g, "/").split("/").filter((p) => p && p !== ".");
  if (parts.length === 0 || parts.some((p) => p === "..")) {
    throw new PathError(`invalid workspace path: ${relPath}`);
  }
  return `${WORKSPACE_ROOT}/${parts.join("/")}`;
}

export interface FileTreeNode {
  id: string;
  name: string;
  type: "file" | "folder";
  children?: FileTreeNode[];
}

export interface WorkspaceFileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * List the workspace as a nested tree. One `find` exec instead of a
 * listFiles round-trip per directory.
 *
 * Folder ids carry a trailing slash ("contracts/") so the IDE can route
 * top-level nodes by prefix; file ids are the relative path.
 */
export async function listWorkspaceTree(
  sb: Sandbox,
): Promise<{ tree: FileTreeNode[]; files: WorkspaceFileInfo[] }> {
  const prune = [
    ...PRUNED_DIRS.map((d) => `-name ${shellQuote(d)}`),
    ...PRUNED_PATHS.map((p) => `-path ${shellQuote(p)}`),
  ].join(" -o ");
  const cmd = `find . \\( ${prune} \\) -prune -o \\( -type d -printf 'd %P\\n' \\) -o \\( -type f -printf 'f %P\\n' \\)`;
  const res = await sb.exec(cmd, { workdir: WORKSPACE_ROOT, timeout: "30s" });
  if (res.exit_code !== 0) {
    throw new Error(`listing workspace failed: ${res.stderr || res.stdout}`);
  }

  const files: WorkspaceFileInfo[] = [];
  for (const line of res.stdout.split("\n")) {
    const kind = line[0];
    const path = line.slice(2).trim();
    if (!path || (kind !== "d" && kind !== "f")) continue;
    files.push({ name: path.split("/").pop()!, path, isDirectory: kind === "d" });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));

  const root: FileTreeNode[] = [];
  const folders = new Map<string, FileTreeNode>();
  const childrenOf = (parentPath: string): FileTreeNode[] => {
    if (!parentPath) return root;
    const parent = folders.get(parentPath);
    if (parent) return (parent.children ??= []);
    // Parent was listed after the child (or pruned); create it on demand.
    const name = parentPath.split("/").pop()!;
    const node: FileTreeNode = { id: `${parentPath}/`, name, type: "folder", children: [] };
    folders.set(parentPath, node);
    childrenOf(parentPath.split("/").slice(0, -1).join("/")).push(node);
    return node.children!;
  };

  for (const f of files) {
    const parentPath = f.path.split("/").slice(0, -1).join("/");
    if (f.isDirectory) {
      if (folders.has(f.path)) continue;
      const node: FileTreeNode = { id: `${f.path}/`, name: f.name, type: "folder", children: [] };
      folders.set(f.path, node);
      childrenOf(parentPath).push(node);
    } else {
      childrenOf(parentPath).push({ id: f.path, name: f.name, type: "file" });
    }
  }

  const sortNodes = (nodes: FileTreeNode[]) => {
    nodes.sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === "folder" ? -1 : 1,
    );
    for (const n of nodes) if (n.children) sortNodes(n.children);
  };
  sortNodes(root);

  return { tree: root, files };
}

/** Start `next dev` in /workspace/frontend unless something already listens. */
export async function startPreview(sb: Sandbox): Promise<void> {
  if (await isPreviewReady(sb)) return;
  const cmd =
    `pgrep -f "next dev" >/dev/null 2>&1 || ` +
    `(nohup bun run dev --hostname 0.0.0.0 --port ${PREVIEW_PORT} > /tmp/preview.log 2>&1 &)`;
  await sb.exec(cmd, { workdir: `${WORKSPACE_ROOT}/frontend`, timeout: "15s" });
}

export async function isPreviewReady(sb: Sandbox): Promise<boolean> {
  const res = await sb.exec(
    `curl -s -o /dev/null -m 3 -w '%{http_code}' http://127.0.0.1:${PREVIEW_PORT}/ || true`,
    { timeout: "10s" },
  );
  const code = parseInt(res.stdout.trim(), 10);
  return Number.isFinite(code) && code > 0;
}
