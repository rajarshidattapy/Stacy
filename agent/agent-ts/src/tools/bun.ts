// Bun + Next.js frontend tool wrappers. Each calls bash() inside the sandbox
// and parses the output into a structured shape so the LLM doesn't have to
// grep raw stdout.
//
// All tools default to /workspace/frontend (the StacyVM dev-base ships a
// Next.js 16 starter there). Each accepts an optional `cwd` so the integration
// agent can target other roots if a project ever differs.
//
// Note: PRD §8.3 originally specified port 5173 (Vite). The actual starter is
// Next.js so the dev-smoke tool defaults to port 3000. This is recorded as an
// amendment in agent-ts/changes.md.
import { bash } from "./bash.ts";
import { ok, err, type Result } from "./result.ts";
import { listDir } from "./filesystem.ts";

const FRONTEND_DIR = "/workspace/frontend";
const DEV_SMOKE_DEFAULT_PORT = 3000;
const DEV_SMOKE_DEFAULT_TIMEOUT_MS = 15000;

// ── bun_install ─────────────────────────────────────────────────────────────
export interface BunInstallResult {
  success: boolean;
  added: string[];
  warnings: string[];
  raw: string;
}

export async function bunInstall(
  sandboxId: string,
  opts: { cwd?: string } = {},
): Promise<Result<BunInstallResult>> {
  const cwd = opts.cwd ?? FRONTEND_DIR;
  const r = await bash(sandboxId, "bun install", { cwd, timeout: "5m" });
  if (!r.ok) return r;
  const combined = `${r.data.stdout}\n${r.data.stderr}`;
  // Bun reports added packages in lines like "+ react@19.0.0" (sometimes
  // with leading whitespace from the progress renderer).
  const added: string[] = [];
  for (const line of combined.split("\n")) {
    const m = line.match(/^\s*\+\s+(\S+@\S+)/);
    if (m) added.push(m[1]);
  }
  const warnings = combined
    .split("\n")
    .filter((l) => /^\s*warn/i.test(l) || /\bwarning\b/i.test(l));
  return ok({
    success: r.data.exitCode === 0,
    added,
    warnings,
    raw: combined.slice(-4000),
  });
}

// ── bun_run_build ───────────────────────────────────────────────────────────
export interface BunBuildResult {
  success: boolean;
  warnings: string[];
  errors: string[];
  raw: string;
}

export async function bunRunBuild(
  sandboxId: string,
  opts: { cwd?: string } = {},
): Promise<Result<BunBuildResult>> {
  const cwd = opts.cwd ?? FRONTEND_DIR;
  const r = await bash(sandboxId, "bun run build", { cwd, timeout: "10m" });
  if (!r.ok) return r;
  const combined = `${r.data.stdout}\n${r.data.stderr}`;
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const line of combined.split("\n")) {
    if (/^\s*(?:✗|×|Error|error|Failed)/i.test(line) || /\berror\b/i.test(line)) {
      errors.push(line);
    } else if (/\bwarn(ing)?\b/i.test(line) || /^\s*⚠/.test(line)) {
      warnings.push(line);
    }
  }
  return ok({
    success: r.data.exitCode === 0,
    warnings,
    errors,
    raw: combined.slice(-6000),
  });
}

// ── bun_run_lint ────────────────────────────────────────────────────────────
export interface BunLintIssue {
  file?: string;
  line?: number;
  rule?: string;
  message: string;
}

export interface BunLintResult {
  success: boolean;
  issues: BunLintIssue[];
  raw: string;
}

export async function bunRunLint(
  sandboxId: string,
  opts: { cwd?: string } = {},
): Promise<Result<BunLintResult>> {
  const cwd = opts.cwd ?? FRONTEND_DIR;
  const r = await bash(sandboxId, "bun run lint", { cwd, timeout: "3m" });
  if (!r.ok) return r;
  const combined = `${r.data.stdout}\n${r.data.stderr}`;
  // ESLint default formatter looks like:
  //   /workspace/frontend/src/foo.tsx
  //     12:5  error  Unexpected console statement  no-console
  const issues: BunLintIssue[] = [];
  let currentFile: string | undefined;
  for (const line of combined.split("\n")) {
    const fileMatch = line.match(/^(\/?\S+\.(?:tsx?|jsx?))\s*$/);
    if (fileMatch) {
      currentFile = fileMatch[1];
      continue;
    }
    const issueMatch = line.match(/^\s*(\d+):(\d+)\s+(error|warning)\s+(.+?)(?:\s+([\w/-]+))?\s*$/);
    if (issueMatch) {
      issues.push({
        file: currentFile,
        line: parseInt(issueMatch[1], 10),
        message: issueMatch[4],
        rule: issueMatch[5],
      });
    }
  }
  return ok({
    success: r.data.exitCode === 0,
    issues,
    raw: combined.slice(-4000),
  });
}

// ── bun_dev_smoke ───────────────────────────────────────────────────────────
export interface BunDevSmokeResult {
  success: boolean;
  port: number;
  statusCode?: number;
  bootMs?: number;
  raw: string;
}

// Starts `bun dev` in background, polls localhost:<port>, kills it. The whole
// thing runs as a single shell expression so we always reach the kill step
// even when polling times out.
export async function bunDevSmoke(
  sandboxId: string,
  opts: { cwd?: string; port?: number; timeoutMs?: number } = {},
): Promise<Result<BunDevSmokeResult>> {
  const cwd = opts.cwd ?? FRONTEND_DIR;
  const port = opts.port ?? DEV_SMOKE_DEFAULT_PORT;
  const timeoutMs = opts.timeoutMs ?? DEV_SMOKE_DEFAULT_TIMEOUT_MS;
  const timeoutSecs = Math.max(3, Math.floor(timeoutMs / 1000));

  // Single composite shell expression:
  //   1. nohup bun dev → background, capture pid
  //   2. poll http://localhost:<port> every 500ms up to <timeout>s
  //   3. kill the pid (TERM, then KILL); always pkill -f "bun dev" as safety net
  //   4. emit a final line `RESULT status=<code> elapsed=<ms>`
  const script = `
set +e
LOG=/tmp/bun-dev-smoke.log
nohup bun dev --port ${port} >"$LOG" 2>&1 &
PID=$!
START=$(date +%s%3N)
STATUS=0
for i in $(seq 1 ${timeoutSecs * 2}); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${port}/" --max-time 2 || echo 0)
  if [ "$STATUS" = "200" ]; then break; fi
  sleep 0.5
done
NOW=$(date +%s%3N)
ELAPSED=$((NOW - START))
kill -TERM "$PID" 2>/dev/null
sleep 1
kill -KILL "$PID" 2>/dev/null
pkill -f "bun dev" 2>/dev/null
echo
echo "RESULT status=$STATUS elapsed=$ELAPSED"
tail -c 2000 "$LOG" 2>/dev/null
`.trim();

  const r = await bash(sandboxId, script, { cwd, timeout: `${timeoutSecs + 30}s` });
  if (!r.ok) return r;
  const combined = `${r.data.stdout}\n${r.data.stderr}`;
  const m = combined.match(/RESULT status=(\d+) elapsed=(\d+)/);
  const statusCode = m ? parseInt(m[1], 10) : 0;
  const bootMs = m ? parseInt(m[2], 10) : undefined;
  return ok({
    success: statusCode === 200,
    port,
    statusCode: statusCode || undefined,
    bootMs,
    raw: combined.slice(-4000),
  });
}

// ── list_frontend_tree ──────────────────────────────────────────────────────
export interface FrontendTreeNode {
  path: string;
  type: "file" | "dir";
  children?: FrontendTreeNode[];
}

export async function listFrontendTree(
  sandboxId: string,
  opts: { cwd?: string; maxDepth?: number } = {},
): Promise<Result<{ root: string; tree: FrontendTreeNode }>> {
  const root = (opts.cwd ?? FRONTEND_DIR).replace(/\/$/, "");
  const maxDepth = opts.maxDepth ?? 6;

  // Sanity-check the directory exists. We use listDir just to surface a clean
  // error if not — find would silently return nothing.
  const head = await listDir(sandboxId, { path: root });
  if (!head.ok) return err(`frontend root not found at ${root}: ${head.error}`, "ROOT_MISSING");

  // Walk via find. Skip node_modules / .next / .git / out / dist.
  const cmd = `find "${root}" -maxdepth ${maxDepth} \\( \
-path '*/node_modules' -o -path '*/.next' -o -path '*/.git' -o -path '*/out' -o -path '*/dist' -o -path '*/.turbo' \\) -prune -o -print`;
  const r = await bash(sandboxId, cmd);
  if (!r.ok) return r;

  const lines = r.data.stdout
    .split("\n")
    .map((s) => s.trim())
    .filter((l) => l.length > 0 && l !== root);

  // Build a nested tree keyed by relative path components.
  const nodes = new Map<string, FrontendTreeNode>();
  const rootNode: FrontendTreeNode = { path: root, type: "dir", children: [] };
  nodes.set(root, rootNode);

  // Sort so parents are created before children.
  lines.sort();
  for (const path of lines) {
    if (!path.startsWith(root + "/")) continue;
    const parent = path.slice(0, path.lastIndexOf("/"));
    const parentNode = nodes.get(parent) ?? rootNode;
    // Heuristic: if a path starts with another path + "/", the former is a
    // directory. Detected on a second pass below — for now mark everything
    // as file; promote to dir when a child is found.
    const node: FrontendTreeNode = { path, type: "file" };
    parentNode.children = parentNode.children ?? [];
    parentNode.children.push(node);
    nodes.set(path, node);
  }

  // Promote any node that ended up as a parent to type=dir.
  for (const node of nodes.values()) {
    if (node.children && node.children.length > 0 && node !== rootNode) {
      node.type = "dir";
    }
  }

  return ok({ root, tree: rootNode });
}
