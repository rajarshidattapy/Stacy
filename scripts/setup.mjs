// One-time local setup: env files, Postgres, StacyVM (via `npx stacyvm-setup`),
// the EVM sandbox image, dependencies and the agent database schema.
//
//   npm run setup                    everything
//   npm run setup -- --skip-stacyvm  StacyVM is already installed elsewhere
import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  AGENT_DIR,
  FRONTEND_DIR,
  ROOT,
  bun,
  c,
  has,
  isStacyvmLive,
  run,
  step,
  succeeds,
} from "./lib.mjs";

const argv = new Set(process.argv.slice(2));
const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE ?? "stacy-evm:latest";
const IMAGE_SOURCE = resolve(ROOT, "stacyvm/images/evm");

function copyIfMissing(from, to) {
  if (existsSync(to)) {
    console.log(c.dim(`  ${to} already exists`));
    return;
  }
  copyFileSync(from, to);
  console.log(`  created ${to}`);
}

async function waitForPostgres() {
  for (let i = 0; i < 30; i++) {
    if (succeeds("docker", ["compose", "exec", "-T", "postgres", "pg_isready", "-U", "stacyvm"], { cwd: ROOT })) {
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Postgres did not become ready in 30s");
}

async function main() {
  step("Checking prerequisites");
  if (!has("docker") || !succeeds("docker", ["info"])) {
    throw new Error("Docker is required and must be running (start Docker Desktop).");
  }
  if (!has("bun")) console.log(c.yellow("  bun not found; using `npx bun` (install bun for faster runs)"));

  step("Environment files");
  copyIfMissing(resolve(AGENT_DIR, ".env.example"), resolve(AGENT_DIR, ".env"));
  copyIfMissing(resolve(FRONTEND_DIR, ".env.example"), resolve(FRONTEND_DIR, ".env.local"));

  step("Postgres (agent memory)");
  run("docker", ["compose", "up", "-d", "postgres"], { cwd: ROOT });
  await waitForPostgres();

  step("StacyVM");
  if (argv.has("--skip-stacyvm")) {
    console.log(c.dim("  skipped (--skip-stacyvm)"));
  } else if (await isStacyvmLive()) {
    console.log(c.green("  StacyVM server is already running"));
  } else if (has("stacyvm")) {
    console.log(c.green("  stacyvm is installed; `npm run dev` will start it"));
  } else {
    // --dir keeps the installer away from ./stacyvm. Without it the installer
    // treats ./stacyvm as its own clone and runs `git reset --hard` there,
    // which would act on this repository.
    run("npx", ["-y", "stacyvm-setup@latest", "--dir", ".stacyvm", "--no-start"], { cwd: ROOT });
    if (has("stacyvm")) {
      run("stacyvm", ["setup"]);
    } else {
      console.log(
        c.yellow("  StacyVM was installed but is not on this terminal's PATH yet.\n") +
          c.yellow("  Open a new terminal, run `stacyvm setup`, then re-run `npm run setup`."),
      );
    }
  }

  step(`Sandbox image ${SANDBOX_IMAGE}`);
  if (succeeds("docker", ["image", "inspect", SANDBOX_IMAGE])) {
    console.log(c.dim("  already built (docker rmi it to rebuild)"));
  } else if (existsSync(IMAGE_SOURCE)) {
    run("docker", ["build", "-t", SANDBOX_IMAGE, IMAGE_SOURCE]);
  } else {
    console.log(c.yellow(`  ${IMAGE_SOURCE} not found; build ${SANDBOX_IMAGE} from StacyVM's images/evm manually.`));
  }

  step("Dependencies");
  const [bunCmd, ...bunArgs] = bun();
  run(bunCmd, [...bunArgs, "install"], { cwd: AGENT_DIR });
  run("npm", ["install", "--no-audit", "--no-fund"], { cwd: FRONTEND_DIR });

  step("Agent database schema");
  run(bunCmd, [...bunArgs, "run", "db:migrate"], { cwd: AGENT_DIR });

  console.log(`\n${c.green("✔")} Setup complete.`);
  console.log(`  Add ${c.bold("ANTHROPIC_API_KEY")} to agent/agent-ts/.env if you haven't, then run ${c.bold("npm run dev")}.`);
}

main().catch((e) => {
  console.error(`\n${c.red("✖")} ${e.message}`);
  process.exit(1);
});
