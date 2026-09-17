# Companion PRD — Phase-by-Phase Build Instructions

**This is a companion to `AGENT_SYSTEM_PRD.md`.** Read that first. This document does not redefine architecture — it specifies execution order, sub-steps within each phase, file paths to create, and acceptance gates that must pass before moving to the next phase.

Hand both PRDs to Claude Code. The main PRD is the WHAT. This is the HOW and IN WHAT ORDER.

---

## Two Updates to the Main PRD (Apply From Day One)

These two requirements are not in the main PRD but must be implemented from the start. Treat them as authoritative amendments.

### Update A — `pauseBetweenPhases` (affects Orchestrator, Phase 6)

The Orchestrator must accept a config flag `pauseBetweenPhases: boolean` with default value `true`. When `true`, after each phase (contracts → frontend → integration) the Orchestrator must:

1. Mark the phase complete in its todo state.
2. Emit a `phase_complete` event with a structured summary: phase name, todos completed, key artifacts (deployed addresses, files created), any deferred items.
3. Halt and wait for a user message before proceeding to the next phase.
4. If the user replies with feedback (anything other than approval), run a single cleanup pass on the just-finished phase that incorporates the feedback before advancing.
5. If the user approves ("proceed", "yes", "continue", "next"), advance to the next phase.

When `false`, phases run autonomously with no pause. Useful for full-auto kickoffs and tests.

The waiting mechanism is built into the runtime layer: the Orchestrator emits a special `awaiting_user_input` event and yields control. The CLI test harness (and later the agentic server) is responsible for treating this as a checkpoint and resuming on the next user message. The Orchestrator's checkpoint must persist before yielding so a process restart doesn't lose the wait state.

### Update B — Subagent Circuit Breaker (affects every parent that uses `task`, Phase 1+)

Every parent agent that delegates via the `task` tool must implement a circuit breaker keyed by `(subagent_name, task_signature)` where `task_signature` is the first 16 hex characters of SHA-256 of the task description.

**Behavior:**

- Track failures in the `agent.delegations` Postgres table (already in main PRD §11.2 schema). A "failure" means the subagent returned `status: "failure"` or threw.
- Before invoking a subagent, query: count of failures for this `(subagent_name, task_signature)` in the last hour. If count ≥ 3, do not invoke. Return synthetically: `{ status: "circuit_open", attempts: [...summaries from the 3 failed runs...], guidance_required: true }`.
- The parent's prompt selector adds the fragment `circuit-breaker-tripped.txt` whenever the most recent tool result has `status: "circuit_open"`. That fragment instructs the parent to surface the situation to the user (with all 3 attempt summaries) and ask for guidance — not to retry.
- The circuit resets when: (a) the same task signature succeeds, or (b) a new task description with a different signature is submitted, or (c) explicit `clearCircuit(subagentName)` is called (admin-only, not exposed to LLM).

Add `prompts/fragments/circuit-breaker-tripped.txt` to the sub-prompt library (specified in main PRD §7).

---

## Operational Rules That Apply To Every Phase

These are non-negotiable.

1. **One phase at a time.** Don't start Phase N+1 until Phase N's acceptance gate passes. Resist the urge to work in parallel — the gates exist because each phase de-risks the next.
2. **Tools before agents.** Every tool must pass its individual acceptance gate (callable from a script, returning sensible structured output) before being wired into any agent.
3. **Manual verification dominates v0.** Eyes on the terminal, watching the stream. Automated tests come later. The CLI is the harness.
4. **Track tokens.** Every test run, log total tokens consumed. If costs balloon unexpectedly, stop and investigate before continuing.
5. **Commit at every gate.** Each acceptance gate is a checkpoint. Tag the commit with the gate ID (e.g., `gate-1.5-passed`).
6. **The CLI is the only interface for v0.** No backend, no frontend, no fancy orchestration. If you can't drive it from `tsx src/cli/test-harness.ts`, you don't need it yet.

---

## Phase 0 — Foundation

**Goal:** prove the mechanical layer works before any LLM enters the picture. No agents in this phase.

### 0.1 — StacyVM TypeScript Client

Create `src/tools/stacyvmClient.ts` exporting a class wrapping the StacyVM REST API at `STACYVM_URL` (default `http://localhost:7423`). One method per StacyVM endpoint per main PRD §8.1. Auth via `STACYVM_API_KEY` if set. Methods are `async` and return parsed JSON; throw on non-2xx.

Required methods: `spawn`, `destroy`, `exec`, `execStream` (async iterator over NDJSON), `readFile`, `writeFile`, `deleteFile`, `listDir`, `moveFile`, `glob`, `stat`, `getPreviewUrl`.

**Acceptance gate 0.1:** Standalone script `scripts/test-stacyvm.ts` that spawns a sandbox, writes `/tmp/hello.txt`, reads it back, runs `echo "hi" && pwd` via exec, destroys the sandbox. All five operations log success. Run twice consecutively without leftover sandboxes.

### 0.2 — Filesystem Tool Primitives

Create `src/tools/filesystem.ts`. Pure functions (one per filesystem operation) that take `(sandboxId, args)` and call StacyVM client. **Never throw** — always return `{ ok: true, data }` or `{ ok: false, error }`. This is the contract for tools that LLMs will call.

Functions: `readFile`, `writeFile`, `listDir`, `deleteFile`, `moveFile`, `globFiles`, `statFile`.

**Acceptance gate 0.2:** Script that exercises each via JSON args, verifies error case (e.g., reading nonexistent file returns `{ ok: false, error }` rather than throwing).

### 0.3 — Bash Tool Primitive

Create `src/tools/bash.ts` with two functions:
- `bash(sandboxId, command, opts)` — synchronous exec, returns `{ ok, stdout, stderr, exitCode }`
- `bashStream(sandboxId, command, opts)` — async iterator yielding `{ type: 'stdout' | 'stderr', chunk: string }`

`opts`: `{ cwd?: string, env?: Record<string,string>, timeoutMs?: number }`.

**Acceptance gate 0.3:** `bash(id, 'echo hi && pwd')` returns expected stdout and exit 0. `bashStream(id, 'echo line1; sleep 1; echo line2')` yields incrementally with visible 1-second delay between chunks.

### 0.4 — Path-Scoping Wrapper

Create `src/tools/pathScope.ts`. Function `scopeTo(allowedRoots: string[])` returns a higher-order function that wraps a filesystem-tool function. Wrapped function: if any path argument falls outside the allowed roots (after resolution and `..` normalization), return `{ ok: false, error: 'PATH_OUT_OF_SCOPE' }` without calling the underlying tool.

**Acceptance gate 0.4:** Wrap `writeFile` with `scopeTo(['/workspace/foo'])`. `writeFile('/workspace/foo/x.txt', '...')` succeeds. `writeFile('/workspace/bar/x.txt', '...')` returns scope error. `writeFile('/workspace/foo/../bar/x.txt', '...')` also returns scope error (normalization works).

### 0.5 — Postgres + Checkpointer Setup

Create `src/memory/schema.sql` with `CREATE TABLE` statements for `agent.threads`, `agent.runs`, `agent.delegations`, `agent.memory` per main PRD §11.2. Use `agent` schema (`CREATE SCHEMA IF NOT EXISTS agent`).

Create `src/memory/checkpointer.ts` exporting `getCheckpointer(): Promise<PostgresSaver>` — singleton that wraps `@langchain/langgraph-checkpoint-postgres`. Calls `.setup()` on first init.

Create `scripts/db-migrate.ts` that runs `schema.sql` against `DATABASE_URL`.

**Acceptance gate 0.5:** Run `tsx scripts/db-migrate.ts`. Verify all four `agent.*` tables exist via `psql`. Run a script that calls `getCheckpointer()` and saves a fake checkpoint, then loads it back. Round-trip works.

### 0.6 — Canonical Event Types

Create `src/streaming/events.ts` with TypeScript discriminated union for the event types in main PRD §13. Export type `AgentEvent`.

Create `src/streaming/translator.ts` exporting `translateLangGraphEvent(rawEvent): AgentEvent | null`. Handles LangGraph's `streamEvents` v2 format. Returns `null` for events we don't care about (silenced).

**Acceptance gate 0.6:** Unit test (Vitest or similar) feeds sample LangGraph events (mocked from real LangGraph output captured in a tiny throwaway test agent) into the translator. Verify each maps to expected canonical event or null.

### 0.7 — Test Harness CLI Shell

Create `src/cli/test-harness.ts`. At Phase 0 it should:

- Parse flags from main PRD §14: `--agent`, `--sandbox`, `--new-sandbox`, `--template`, `--thread`, `--new-thread`, `--profile`, `--prd`, `--max-tokens`. Add `--no-pause` (sets `pauseBetweenPhases=false` for orchestrator runs).
- If `--new-sandbox`: spawn via StacyVM, log `[harness] Sandbox ready: <id>`.
- If `--prd <path>`: read file from local FS, write to `/workspace/PRD.md` in the sandbox.
- Connect to Postgres, create or resume thread record (`--new-thread` or `--thread <id>`).
- Enter readline loop. On each input line, log `[harness] (no agent wired yet) you said: <input>`.
- Handle Ctrl+C: if sandbox was spawned via `--new-sandbox`, optionally destroy it (prompt y/n). Mark thread row as `idle` in Postgres. Exit cleanly.

**Acceptance gate 0.7:** `tsx src/cli/test-harness.ts --new-sandbox` spawns, prints sandbox ID, accepts input lines, exits cleanly on Ctrl+C, removes the sandbox. Run again with `--sandbox <existing-id>` to verify reuse mode works.

---

## Phase 1 — Smart Contract Agent (THE CRITICAL GATE)

**Goal:** prove a real agent can write, compile, test, and deploy a contract from CLI input. Pass main PRD §18.

### 1.1 — Forge Tool Implementations

Create `src/tools/forge.ts`. Implement each tool from main PRD §8.2. Each is a wrapper over `bash` from §0.3, plus structured parsing of output.

**Implementation order** (test each via a standalone script before moving to the next):

1. `forge_build()` — `bash(id, 'forge build --silent', { cwd: '/workspace/contracts' })`. Parse output: success = exit 0, no warnings; otherwise extract warnings/errors as structured array.
2. `forge_test(matchTest?, verbosity?)` — Builds command with optional flags. Parses output for pass/fail counts and per-test details on failure.
3. `forge_fmt()` — Fire and forget; returns `{ ok }` only.
4. `forge_inspect_abi(contractName)` — `forge inspect <name> abi`. Returns parsed JSON.
5. `extract_abi(contractFile, contractName)` — Runs `forge build --silent && jq '.abi' out/<contractFile>/<contractName>.json`, captures jq stdout, writes to `/workspace/contracts/.deployments/<contractName>.abi.json`.
6. `read_deployed_address(contractName, chainId = 11155111)` — Lists `broadcast/*/<chainId>/run-latest.json`, parses each, finds entries where `contractName` matches in `transactions[]`, returns the `contractAddress`. Persists to `.deployments/<contractName>.address`.
7. `forge_deploy_sepolia(scriptPath)` — `source .env && forge script <scriptPath> --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast`. Parse output for deployment confirmation.
8. `list_contracts()` — Globs `contracts/src/**/*.sol`, reads each, regex-extracts `contract X is|{` declarations, returns array of `{ file, contractName }`.
9. `slither_audit(contractFile?)` — `slither . --json -` or specific file. Parse JSON output.

**Acceptance gate 1.1:** Spawn a sandbox with the dev-base image (which has Foundry and your default Counter project pre-loaded). Hardcode `/workspace/contracts/.env` with `RPC_URL` and `PRIVATE_KEY` for Sepolia. Run a script that calls each of the 9 tools in sequence, prints structured output. Specifically verify:
- forge_build succeeds on the default project
- forge_test reports passing tests
- forge_deploy_sepolia produces a real Sepolia deployment (check Etherscan)
- read_deployed_address parses the new broadcast file and returns the address
- extract_abi produces valid ABI JSON

This gate is critical. Every subsequent phase assumes these tools are reliable.

### 1.2 — Sub-Prompts and Composer

Create the prompt files:
- `src/prompts/base/smart-contract.txt` — SC agent identity, scope rule (only `/workspace/contracts/`), env-loading rule (always `source .env` before deploys), Sepolia-only rule, ABI extraction rule, naming flexibility note (don't hardcode "Counter")
- `src/prompts/fragments/test-debugging.txt` — guidance when last action was a failing forge test
- `src/prompts/fragments/deployment-mode.txt` — guidance when about to deploy
- `src/prompts/fragments/fresh-deploy.txt` — for first-time deploy of a contract
- `src/prompts/fragments/redeploy.txt` — for redeploying
- `src/prompts/fragments/error-recovery.txt` — when the previous tool call failed
- `src/prompts/fragments/circuit-breaker-tripped.txt` (per Update B above) — when a subagent has hit 3 failures

Create `src/prompts/composer.ts` exporting `composePrompt({ base, fragments, agentsMd, longTermMemory }): string`. Concatenates with section dividers like `\n\n---\n\n## <section name>\n\n`.

Create `src/prompts/selector.ts` exporting `selectFragments(state): string[]`. Rule-based, examines: current todo (string match on keywords like "test", "deploy"), most recent tool result (`status === 'failure'` triggers error-recovery; circuit_open triggers circuit-breaker-tripped), most recent user message keywords. **No LLM call.**

**Acceptance gate 1.2:** Unit test selector with sample states returns expected fragment names. Composer test: render with dummy inputs, verify section dividers and content order.

### 1.3 — Subagent Runner with Circuit Breaker

Create `src/agents/_runtime/subagentRunner.ts` exporting `runSubagent({ subagentDef, taskDescription, contextBundle, parentRunId, sandboxId, threadId })`.

Behavior:
1. Compute `taskSignature = sha256(taskDescription).slice(0, 16)`.
2. Query `agent.delegations`: count rows where `child_subagent_name = subagentName AND task_signature = taskSignature AND result->>'status' = 'failure' AND created_at > NOW() - INTERVAL '1 hour'`.
3. If count ≥ 3: persist a `delegations` row with `result: { status: 'circuit_open', attempts: [...] }`, return that result without invoking the subagent. (Fetch the 3 attempt summaries from the same query for the `attempts` array.)
4. Otherwise: instantiate the subagent (a `createDeepAgent` call with the subagent's spec), invoke with the task description as the user message, capture the structured summary it returns, persist a `delegations` row, return the summary.

This runner is invoked by the parent's `task` tool implementation. The parent doesn't see the subagent's internals — only the returned summary.

### 1.4 — SC Subagents

Create one file per subagent in `src/agents/smartContract/subagents/`. Each exports a `SubagentSpec` object with: name, description, system prompt, tools allowlist, model profile (override of parent default), max LLM calls.

Specs to create per main PRD §9.1:
- `compile.ts` (sc-compile)
- `test.ts` (sc-test)
- `deploy.ts` (sc-deploy)
- `quickAudit.ts` (sc-quick-audit)
- `abiExtract.ts` (sc-abi-extract)

**Acceptance gate 1.4:** A standalone test invokes each subagent directly via `runSubagent` (bypassing the parent agent). Each returns a sensible structured summary against a real sandbox. Specifically: sc-compile on the default Counter project returns `{ status: 'success' }`. Force a circuit breaker test: invoke sc-compile with a deliberately broken contract 3 times in a row, verify the 4th call returns `{ status: 'circuit_open' }` without an LLM call.

### 1.5 — Smart Contract Agent

Create `src/agents/smartContract/index.ts` exporting `createSmartContractAgent(config)` returning a `createDeepAgent` instance:

- System prompt assembled via §1.2 composer (base + selected fragments + AGENTS.md if present)
- Tools: filesystem tools (scoped to `/workspace/contracts/`), bash (scoped), all forge_* tools, list_contracts
- Subagents registered: the 5 from §1.4
- Checkpointer: from §0.5
- Default model profile: `standard-think` (per main PRD §10.2). Per-call profile selection via `selectProfile(intent)`.

Wire into the test harness CLI: when `--agent smart-contract`, instantiate this agent, replace the placeholder readline loop body with a real `agent.stream({ messages: [...] }, { configurable: { thread_id, sandbox_id } })` call, pipe events through the translator to the canonical event printer.

**Acceptance gate 1.5 (THE BIG GATE):**

Fresh sandbox. Hardcoded `.env`. Run:
```
tsx src/cli/test-harness.ts --agent smart-contract --new-sandbox --new-thread
```

Walk through main PRD §18's eight steps. Every step succeeds with visible streaming (thinking, tool calls, subagent spawns, todo updates).

Kill the script (Ctrl+C). Restart with `--sandbox <id> --thread <id>`. Send a follow-up message. Verify the agent picks up cleanly with full conversation context.

Run the full 8-step test from a fresh sandbox **twice in a row**. Both must pass. Only then move to Phase 2.

---

## Phase 2 — Audit Agent

**Goal:** standalone audit reports that identify real vulnerabilities.

### 2.1 — Audit Tools

Verify Slither is in the dev-base image. If not: add to Dockerfile (`pip install slither-analyzer`), rebuild, retag image. Update StacyVM template to use the new image.

Create `src/tools/audit.ts`:
- `slitherAudit(sandboxId, contractFile?)` — runs slither with `--json -`, parses, returns array of findings normalized to `{ severity, title, description, location, swcId? }`
- `solhintCheck(sandboxId, contractFile)` — optional, runs solhint if installed
- `writeAuditReport(sandboxId, content)` — writes to `/workspace/.audit/audit-<ISO_timestamp>.md` (creates directory if missing)

**Acceptance gate 2.1:** Plant a vulnerable contract (e.g., reentrancy in a withdraw function). Manually call `slitherAudit` from a script. Verify it returns the reentrancy finding with high severity.

### 2.2 — Audit Prompts

Create:
- `src/prompts/base/audit.txt` — identity, read-only constraint, must produce a single markdown report at the end via `writeAuditReport`, must walk the `audit-checklist` skill
- `src/prompts/fragments/audit-thorough.txt` — for default thorough scans
- `src/prompts/fragments/audit-quick.txt` — for quick scans

### 2.3 — Report Formatter

Create `src/agents/audit/reportFormatter.ts` exporting `formatAuditReport(findings, metadata): string`. Pure function, returns markdown with sections: Executive Summary, Findings by Severity (Critical/High/Medium/Low/Informational), Detailed Analysis (per-finding: location, impact, recommendation, severity rationale), Methodology, Tools Used, Limitations.

Used by the audit agent as the final step before `writeAuditReport`.

### 2.4 — Audit Agent

Create `src/agents/audit/index.ts` exporting `createAuditAgent(config)`. No subagents (single-pass agent for v0). Tools: read-only filesystem (scoped to `/workspace/contracts/`), `slitherAudit`, `writeAuditReport`. Default profile: `deep-think`.

**Acceptance gate 2.4 (Phase 2 final):**

Plant a contract with three deliberate bugs: missing access control, reentrancy, integer overflow. Spawn sandbox. Run:
```
tsx src/cli/test-harness.ts --agent audit --new-sandbox
```

Send: "audit the contracts in this project."

Verify:
- Stream shows the agent loading the audit-checklist skill
- Slither is invoked
- Manual reasoning happens (visible in thinking events)
- Final report is written to `/workspace/.audit/audit-<timestamp>.md`
- Report identifies all three planted bugs with appropriate severity

---

## Phase 3 — Frontend Agent

### 3.1 — Bun Tools

Create `src/tools/bun.ts` per main PRD §8.3. The `bun_dev_smoke` tool needs care: start `bun dev` via `bash` with output streaming, poll `localhost:5173` (or auto-discover from output), kill the process via PID, return whether it served a 200. Use a 10-second timeout.

**Acceptance gate 3.1:** Each tool tested individually on a starter Vite+React+Tailwind project that you place into the dev-base image at `/workspace/frontend/`.

### 3.2 — FE Subagents and Agent

Create per main PRD §9.2:
- `src/agents/frontend/subagents/install.ts`
- `src/agents/frontend/subagents/buildCheck.ts`
- `src/agents/frontend/subagents/lintFix.ts`
- `src/agents/frontend/subagents/componentAuthor.ts` — overrides profile to `creative`
- `src/agents/frontend/subagents/devSmoke.ts`

Create `src/agents/frontend/index.ts` exporting `createFrontendAgent(config)`. Tools: filesystem (scoped to `/workspace/frontend/`), bash (scoped), all bun_* tools, list_frontend_tree. Subagents: the 5 above. Default profile: `creative`.

Wire into CLI: `--agent frontend`.

**Acceptance gate 3.2 (Phase 3 final):**

Sandbox with starter frontend. Run:
```
tsx src/cli/test-harness.ts --agent frontend --new-sandbox
```

Send: "Add a Counter component with increment/decrement buttons and a count display. Use Tailwind. Don't wire it to a contract yet — just static UI with local state."

Verify: component file written, `bun run build` succeeds, dev smoke confirms server boots, you can manually open the preview URL and see the counter UI work locally.

---

## Phase 4 — Integration Agent

### 4.1 — Integration Tools

Create `src/tools/integration.ts`:
- `syncAbiToFrontend(sandboxId, contractName)` — calls `extractAbi` then writes the result to `/workspace/frontend/src/abi/<contractName>.json`
- `writeContractAddressConstants(sandboxId, contractName, address, chainId)` — read-modify-write on `/workspace/frontend/src/lib/addresses.ts`. If file doesn't exist, create with shape `export const addresses = { [chainId]: { [contractName]: '0x...' } }`. If exists, parse-merge-rewrite (use a small typescript AST tool or just a regex for v0).
- `listBroadcasts(sandboxId)` — walks `/workspace/contracts/broadcast/`, returns list of `{ scriptName, chainId, runFile, deployedContracts }`

**Acceptance gate 4.1:** Each tool tested manually given a deployed Counter from Phase 1.

### 4.2 — Integration Subagents and Agent

Create per main PRD §9.3:
- `src/agents/integration/subagents/abiSync.ts`
- `src/agents/integration/subagents/addressSync.ts`
- `src/agents/integration/subagents/wagmiSetup.ts`
- `src/agents/integration/subagents/hookAuthor.ts`

Create `src/agents/integration/index.ts` exporting `createIntegrationAgent(config)`. Tools: filesystem (write-scoped to `/workspace/frontend/`, read access to `/workspace/contracts/abi files and broadcast/`), bash (scoped to frontend), bun_* tools, integration tools. Default profile: `standard-think`.

**Acceptance gate 4.2 (Phase 4 final):**

A sandbox containing both: a deployed Counter from Phase 1 (broadcast file present, .deployments has address), and the Counter UI component from Phase 3. Run:
```
tsx src/cli/test-harness.ts --agent integration --sandbox <id>
```

Send: "Wire the Counter UI to the deployed Counter contract. Use wagmi and viem. Sepolia only."

Verify: ABI synced to `frontend/src/abi/`, addresses.ts has the contract address, wagmi config and provider scaffolded in `frontend/src/lib/wagmi.ts` (or wherever the agent decides), the Counter component now uses wagmi hooks, `bun run build` still succeeds, dev smoke passes.

Manual end-to-end: open the preview URL in a browser, connect MetaMask to Sepolia, click increment — the contract state actually changes (verify via `cast call` or block explorer).

---

## Phase 5 — Planner Agent

### 5.1 — Planner Tools

Create `src/agents/planner/tools.ts`:
- `lookupTemplate(name)` — reads from `./templates/<name>.md` in the agent backend's local filesystem. For v0, just have 2-3 hand-written templates (e.g., `simple-erc20.md`, `nft-mint-with-whitelist.md`).
- `savePrd(content)` — writes to `./generated-prds/<ISO_timestamp>.md`. Returns the path.

No StacyVM tools — planner has no container.

### 5.2 — Planner Agent

Create `src/agents/planner/index.ts` exporting `createPlannerAgent(config)`.

System prompt (`src/prompts/base/planner.txt`): instructs iterative refinement until user explicitly approves; PRD must include sections covering contracts, frontend, integration with the depth specified in main PRD §3.1.

Tools: lookupTemplate, savePrd. Profile: `chat`. Checkpointer: same Postgres for thread persistence.

Wire into CLI with new flag `--no-sandbox` (planner doesn't need one).

**Acceptance gate 5.2 (Phase 5 final):**

```
tsx src/cli/test-harness.ts --agent planner --no-sandbox --new-thread
```

Have a real conversation about building "an ERC721 mint with a whitelist using Merkle proofs." Iterate 3-5 turns where you push back and ask for changes. Approve when satisfied.

Verify: the generated PRD includes contract spec (functions, events, modifiers, security), frontend spec (pages, components, wallet flow), integration spec (ABI flow, addresses, wagmi expectations). Detailed enough that you yourself could build from it without further questions.

---

## Phase 6 — Orchestrator (with `pauseBetweenPhases`)

### 6.1 — PRD Parser

Create `src/agents/orchestrator/kickoff.ts` exporting `parsePrdToTodos(prdContent: string): Promise<PhasedPlan>`.

Single LLM call (profile: `standard-think`). Prompt asks for JSON output matching this shape:

```
{
  contractsPhase: [{ id, title, details, dependsOn: string[] }, ...],
  frontendPhase: [...],
  integrationPhase: [...]
}
```

Use Anthropic's structured output mode (response_format json_schema). Validate the output with a Zod schema.

### 6.2 — AGENTS.md Generator

Create `src/agents/orchestrator/agentsMdGenerator.ts` exporting `generateAgentsMdFiles(prdContent, projectStructure): Promise<{ [path: string]: string }>`.

Three LLM calls in parallel (profile: `cheap`), one per file:
- `/workspace/AGENTS.md` — project conventions
- `/workspace/contracts/AGENTS.md` — contract-specific
- `/workspace/frontend/AGENTS.md` — frontend-specific

Each prompt extracts the relevant slice of the PRD into a focused conventions document.

### 6.3 — Sequential Delegation with Pause Gate

Create `src/agents/orchestrator/delegation.ts` exporting `runOrchestrationLoop(state, config)`.

Pseudocode of the core loop:

```
phases = [
  { name: 'contracts', specialist: 'smart-contract', todos: state.plan.contractsPhase },
  { name: 'frontend', specialist: 'frontend', todos: state.plan.frontendPhase },
  { name: 'integration', specialist: 'integration', todos: state.plan.integrationPhase },
]

for each phase in phases:
  for each todo in phase.todos (respecting dependsOn):
    result = await runSubagent({
      subagentDef: specialists[phase.specialist],
      taskDescription: todo.title + '\n\n' + todo.details,
      contextBundle: { phase: phase.name, projectPrdPath: '/workspace/PRD.md' },
      parentRunId: state.runId,
      sandboxId: state.sandboxId,
      threadId: state.threadId,
    })
    
    if result.status === 'circuit_open':
      // The circuit-breaker-tripped fragment is now active
      // Surface to user, pause, await guidance
      await emitEvent({ type: 'awaiting_user_input', reason: 'circuit_breaker', context: result })
      await waitForResume()
      // user's response becomes new context for retry
      continue
    
    markTodoDone(todo.id)
  
  await emitEvent({
    type: 'phase_complete',
    phase: phase.name,
    summary: { completed: phase.todos.length, artifacts: collectArtifacts(phase) }
  })
  
  if config.pauseBetweenPhases:
    await emitEvent({ type: 'awaiting_user_input', reason: 'phase_gate', phase: phase.name })
    userMsg = await waitForResume()
    if !isApproval(userMsg):
      // run cleanup pass
      cleanupResult = await runSubagent({
        subagentDef: specialists[phase.specialist],
        taskDescription: 'User feedback on just-completed phase: ' + userMsg + '\n\nIncorporate this feedback into the existing work.',
        contextBundle: { phase: phase.name, justCompleted: true },
        ...
      })
      await emitEvent({ type: 'phase_finalized', phase: phase.name })
```

The `waitForResume` mechanism: orchestrator persists the checkpoint, emits `awaiting_user_input`, returns from the current invocation. The runtime (CLI or future server) recognizes this event and treats it as a checkpoint boundary. Next user message resumes the run from the saved checkpoint.

### 6.4 — Orchestrator Agent

Create `src/agents/orchestrator/index.ts` exporting `createOrchestratorAgent(config: { pauseBetweenPhases?: boolean })` (default `true`).

Tools: filesystem (write-scoped to `/workspace/AGENTS.md`, `/workspace/contracts/AGENTS.md`, `/workspace/frontend/AGENTS.md`, `/workspace/.agent/todos.json`), `task` for delegating to specialists, `write_todos`.

Subagents registered: smart-contract, frontend, integration (these are the FULL agents from Phases 1, 3, 4 acting as subagents — they bring their own subagent trees with them).

System prompt (`src/prompts/base/orchestrator.txt`): orchestration role, never write code directly, always delegate, sequential phase ordering, pause gate behavior if enabled, PRD.md is primary source of truth.

CLI integration: `--agent orchestrator` should also accept `--prd <path>` (writes the PRD to the sandbox before invoking) and `--no-pause` (disables pauseBetweenPhases).

### 6.5 — Phase 6 Acceptance Gate

This is a multi-step, multi-minute test. Budget 30+ minutes including retries.

1. Generate a PRD with the Phase 5 Planner. Use a real-ish project: "ERC721 mint with whitelist via Merkle proof, frontend with mint button and whitelist checker."
2. Run:
   ```
   tsx src/cli/test-harness.ts --agent orchestrator --new-sandbox --new-thread --prd ./generated-prds/<file>.md
   ```
3. Watch the kickoff: orchestrator reads PRD, writes 3 AGENTS.md files, generates the phased plan, persists todos.
4. Watch contracts phase: SC agent (as subagent) writes the contract, runs sc-compile, sc-test, sc-deploy, sc-abi-extract. Multiple subagent spawn events visible in stream. Final phase_complete emitted.
5. CLI shows "Awaiting user input (phase gate)". Type "looks good, continue."
6. Watch frontend phase. Same sub-events. Phase complete. Pause again.
7. Type "continue."
8. Watch integration phase. End-to-end wiring happens.
9. Final state: a working project with deployed contract and integrated frontend. Open the preview URL, connect a wallet, mint an NFT.

A few things to deliberately stress test:

- During the contracts phase, after phase_complete, instead of approving, type "the contract is fine but rename `mint` to `mintNft` for clarity." Verify the cleanup pass runs and the rename happens before frontend phase starts.
- Run again with `--no-pause` to verify autonomous mode works end-to-end without prompts.
- During a phase, kill the script. Restart with `--sandbox <id> --thread <id>`. Verify it resumes from the right point.

If all of the above works, Phase 6 is done.

---

## Phase 7 — Memory & Polish

### 7.1 — Summarization Middleware

Create `src/memory/summarizer.ts` exporting a LangGraph-compatible pre-LLM hook. Behavior:

- Count tokens in current message history (use Anthropic's tokenizer or a cheap approximation)
- If under 30,000: pass through unchanged
- If over: take all messages older than the most recent 10, bucket them, summarize via Haiku, replace the bucketed messages with a single `system` message: `[Earlier conversation summary]\n\n<summary content>`. Persist the summary alongside the checkpoint metadata so it doesn't need re-summarizing on next call.

Wire this into every agent's runtime config.

**Acceptance gate 7.1:** Run an SC agent session for 50+ turns intentionally (lots of small back-and-forth). Verify the summarizer kicks in around turn 20-25. Check that turn 30's response correctly references a fact from turn 5 (which is now only in the summary).

### 7.2 — Long-Term Memory Tools

Create `src/memory/longTerm.ts`:
- `remember(userId, projectId, namespace, key, value)` — upsert into `agent.memory`
- `recall(userId, projectId, namespace?, key?)` — query
- `loadLongTermMemory(userId, projectId): Promise<string>` — returns a markdown-formatted string of all memories for this user+project, suitable for injection into system prompts

Expose `remember_fact(namespace, key, value)` and `recall_facts(namespace?)` as agent tools. Available to all agents.

The composer (§1.2) appends `loadLongTermMemory(...)` output as a section in the final system prompt.

**Acceptance gate 7.2:** Have the orchestrator make a decision in one session ("we're using Ownable2Step, not Ownable"). Verify it called `remember_fact`. Start a new thread. Verify the same orchestrator references the prior decision without being told.

### 7.3 — Cost-Bound Profile Downgrading

Create `src/models/budgetGuard.ts`. Tracks total tokens per run in memory. Exposes `getCurrentBudgetPressure(runId): number` (0-1). The `selectProfile(intent)` function reads this and downgrades when pressure > 0.8: Opus → Sonnet, Sonnet → Haiku.

Inject a system message when downgrade activates: "You are in cost-saving mode. Prioritize completing the task over thoroughness."

**Acceptance gate 7.3:** Set a low `--max-tokens` cap in the CLI. Run an agent task that would normally consume more. Verify visible downgrade events in the stream and that the agent finishes within budget.

### 7.4 — Selector Refinement and Stress Test

Refine `src/prompts/selector.ts` based on what proved useful in earlier phases. Add unit tests for tricky cases (multiple fragments triggered simultaneously, conflicting fragments).

Run a multi-day stress test: complex PRD, full Orchestrator run, 50+ interactive follow-ups across multiple sessions, deliberate failures (kill mid-deploy, restart), verify summarization preserves critical facts, verify long-term memory survives across sessions.

**Acceptance gate 7.4 (Phase 7 final):** No state corruption observed. Token costs trend down over the multi-day session as memory accumulates. Summarization preserves every contract decision, every deployed address, every user-stated preference.

---

## After Phase 7

You have a fully functional agent system, drivable from the CLI, ready for the agentic server to wrap. The agentic server's job is now reduced to: HTTP gateway, job queue, worker processes that import these same agent constructors. The agents themselves don't need to change.

Move next to building the agentic server (separate PRD already written).

---

**End of Companion PRD.**
