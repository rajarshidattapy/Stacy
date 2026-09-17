// Small helpers shared by setup.mjs and dev.mjs. No dependencies.
import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const AGENT_DIR = resolve(ROOT, "agent/agent-ts");
export const FRONTEND_DIR = resolve(ROOT, "frontend");
export const STACYVM_URL = process.env.STACYVM_URL ?? "http://localhost:7423";

const isWin = process.platform === "win32";

export const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  magenta: (s) => `\x1b[35m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
};

export function step(title) {
  console.log(`\n${c.cyan("▸")} ${c.bold(title)}`);
}

export function has(cmd) {
  return spawnSync(cmd, ["--version"], { shell: isWin, stdio: "ignore" }).status === 0;
}

/** Run a command with inherited stdio; throws on a non-zero exit. */
export function run(cmd, args, opts = {}) {
  console.log(c.dim(`$ ${[cmd, ...args].join(" ")}`));
  const res = spawnSync(cmd, args, { stdio: "inherit", shell: isWin, ...opts });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} exited with ${res.status ?? res.signal}`);
  }
}

export function succeeds(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { stdio: "ignore", shell: isWin, ...opts }).status === 0;
}

/** bun if installed, otherwise the npm-distributed binary via npx. */
export function bun() {
  return has("bun") ? ["bun"] : ["npx", "-y", "bun"];
}

export async function isStacyvmLive() {
  try {
    const res = await fetch(`${STACYVM_URL}/api/v1/live`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Start a long-running process whose output lines are prefixed with a tag. */
export function startPrefixed(tag, cmd, args, opts = {}) {
  const child = spawn(cmd, args, { shell: isWin, stdio: ["ignore", "pipe", "pipe"], ...opts });
  const write = (stream) => (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (line) stream.write(`${tag} ${line}\n`);
    }
  };
  child.stdout.on("data", write(process.stdout));
  child.stderr.on("data", write(process.stderr));
  return child;
}

export function killTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (isWin) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}
