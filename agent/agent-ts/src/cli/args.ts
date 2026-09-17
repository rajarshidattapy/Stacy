// Argv parser for the test harness. Hand-rolled — no external dep — because
// the flag set is small and the parsing rules are obvious.
export type AgentName =
  | "smart-contract"
  | "frontend"
  | "integration"
  | "orchestrator"
  | "planner"
  | "audit";

export interface HarnessArgs {
  agent: AgentName | null;
  sandbox: string | null;     // existing sandbox to attach to
  newSandbox: boolean;        // spawn a fresh one
  noSandbox: boolean;         // planner-only mode
  template: string | null;    // image / template name
  thread: string | null;      // existing thread id to resume
  newThread: boolean;
  profile: string | null;     // override agent default profile
  prdPath: string | null;     // for orchestrator: PRD to inject into /workspace/PRD.md
  maxTokens: number | null;   // run-level token cap
  noPause: boolean;           // orchestrator: disable pauseBetweenPhases
  keep: boolean;              // don't destroy spawned sandbox on exit
}

const VALID_AGENTS: AgentName[] = [
  "smart-contract",
  "frontend",
  "integration",
  "orchestrator",
  "planner",
  "audit",
];

export function parseArgs(argv: string[]): HarnessArgs {
  const args: HarnessArgs = {
    agent: null,
    sandbox: null,
    newSandbox: false,
    noSandbox: false,
    template: null,
    thread: null,
    newThread: false,
    profile: null,
    prdPath: null,
    maxTokens: null,
    noPause: false,
    keep: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    switch (flag) {
      case "--agent":
        if (!next || !VALID_AGENTS.includes(next as AgentName)) {
          throw new Error(`--agent must be one of: ${VALID_AGENTS.join(", ")}`);
        }
        args.agent = next as AgentName;
        i++;
        break;
      case "--sandbox":
        args.sandbox = next ?? null;
        i++;
        break;
      case "--new-sandbox":
        args.newSandbox = true;
        break;
      case "--no-sandbox":
        args.noSandbox = true;
        break;
      case "--template":
        args.template = next ?? null;
        i++;
        break;
      case "--thread":
        args.thread = next ?? null;
        i++;
        break;
      case "--new-thread":
        args.newThread = true;
        break;
      case "--profile":
        args.profile = next ?? null;
        i++;
        break;
      case "--prd":
        args.prdPath = next ?? null;
        i++;
        break;
      case "--max-tokens":
        args.maxTokens = next ? parseInt(next, 10) : null;
        i++;
        break;
      case "--no-pause":
        args.noPause = true;
        break;
      case "--keep":
        args.keep = true;
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown flag: ${flag}`);
    }
  }

  if (args.sandbox && args.newSandbox) {
    throw new Error("--sandbox and --new-sandbox are mutually exclusive");
  }
  if (args.thread && args.newThread) {
    throw new Error("--thread and --new-thread are mutually exclusive");
  }

  return args;
}

export function printHelp(): void {
  console.log(`
Usage: bun src/cli/test-harness.ts [flags]

Flags:
  --agent <name>      one of: smart-contract | frontend | integration |
                      orchestrator | planner | audit
  --sandbox <id>      attach to an existing StacyVM sandbox
  --new-sandbox       spawn a fresh sandbox (destroyed on exit unless --keep)
  --no-sandbox        no sandbox (planner only)
  --template <name>   image / template name (default: \$SANDBOX_IMAGE)
  --thread <id>       resume an existing thread
  --new-thread        start a fresh thread
  --profile <name>    override the agent's default model profile
  --prd <path>        for orchestrator: local PRD file to inject as /workspace/PRD.md
  --max-tokens <n>    run-level token cap
  --no-pause          for orchestrator: disable pauseBetweenPhases
  --keep              don't destroy a spawned sandbox on exit
  -h, --help          show this help
`);
}
