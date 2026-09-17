// Starts everything for local development:
//   StacyVM server (if not already running) · agent server :8787 · IDE :3000
import {
  AGENT_DIR,
  FRONTEND_DIR,
  bun,
  c,
  has,
  isStacyvmLive,
  killTree,
  startPrefixed,
} from "./lib.mjs";

const children = [];

function shutdown(code = 0) {
  for (const child of children) killTree(child);
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function track(name, child) {
  children.push(child);
  child.on("exit", (code) => {
    console.log(c.red(`[${name}] exited with ${code}; stopping everything`));
    shutdown(code ?? 1);
  });
}

async function main() {
  if (await isStacyvmLive()) {
    console.log(c.dim("[stacyvm] already running"));
  } else if (has("stacyvm")) {
    track("stacyvm", startPrefixed(c.magenta("[stacyvm]"), "stacyvm", ["serve"]));
    for (let i = 0; i < 30 && !(await isStacyvmLive()); i++) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  } else {
    console.log(c.yellow("[stacyvm] not running and not installed. Run `npm run setup` first."));
  }

  const [bunCmd, ...bunArgs] = bun();
  track("agent", startPrefixed(c.blue("[agent]  "), bunCmd, [...bunArgs, "run", "dev"], { cwd: AGENT_DIR }));
  track("ide", startPrefixed(c.green("[ide]    "), "npm", ["run", "dev"], { cwd: FRONTEND_DIR }));

  console.log(`\n${c.bold("Stacy")} is starting → IDE ${c.cyan("http://localhost:3000")} · agent ${c.cyan("http://localhost:8787/health")}\n`);
}

main().catch((e) => {
  console.error(c.red(e.message));
  shutdown(1);
});
