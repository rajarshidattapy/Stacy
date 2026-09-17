# Agent-TS — Development Progress

> Last updated: 2026-05-07 (Phase 3 + 4 landed)
> For: any agent or engineer picking up this codebase cold.

---

## What this project is

A multi-agent TypeScript backend (`agent-ts/`) for an AI-assisted Smart Contract IDE. Agents run inside ephemeral **StacyVM** sandbox containers (one per job) and communicate over the Anthropic API via **deepagents** + **LangGraph** / **LangChain**. Postgres stores thread/run history and LangGraph checkpoints. The CLI (`src/cli/test-harness.ts`) is the primary entry point for manual testing.

**PRD references:**
- `agent-ts/AGENT_SYSTEM_PRD.md` — full system spec (agents, tools, memory, cost control)
- `agent-ts/COMPANION_PRD_PHASES.md` — phased build plan with acceptance gates

---

## Runtime stack

| Piece | Value |
|---|---|
| Runtime | Bun (no build step; TypeScript run directly) |
| Agent SDK | `deepagents` v1.9.x — `createDeepAgent({model, tools, systemPrompt, backend, permissions, checkpointer})` |
| LangGraph | `@langchain/langgraph` — powers the deepagents graph; `@langchain/langgraph-checkpoint-postgres` for persistence |
| LLM | `@langchain/anthropic` → ChatAnthropic |
| Sandbox | `stacyvm` SDK (resolved via tsconfig `paths` alias → `../stacyvm/sdk/js/src/index.ts`; **not** an npm install) |
| Database | Postgres at `localhost:5432` db=`stacyvm` user=`stacyvm` pw=`stacyvm`; env var `DATABASE_URL=postgresql://stacyvm:stacyvm@localhost:5432/stacyvm` |
| Typecheck | `bun run typecheck` → `tsc --noEmit` (must be clean before PR) |

---

## Key architectural decisions (see `changes.md` for full rationale)

### Two filesystems, two tool surfaces

Agents work with two separate filesystems simultaneously, deliberately named to avoid confusion:

| Surface | Tools | Where it lives | Access |
|---|---|---|---|
| **Skills library** | `read_file`, `ls`, `glob`, `grep` (deepagents built-ins) | `agent-ts/skills/` on the agent host | Read-only |
| **User project** | `sandbox_read`, `sandbox_write`, `sandbox_ls`, `sandbox_stat`, `sandbox_delete`, `sandbox_move`, `bash`, `forge_*` | StacyVM container `/workspace/` | Read-write (role-dependent) |

The `sandbox_` prefix prevents name collision with deepagents' built-in FS tools. Skills live with agent code (not in the container image) so they update on redeploy without rebuilding the sandbox image.

Wired via `buildSkillsBackend()` + `READ_ONLY_SKILLS_PERMISSIONS` in `src/agents/_runtime/skillsBackend.ts`. **Both the parent agent and every subagent must use these**, or the built-in `read_file` falls back to in-memory state and skill reads return nothing.

### Model profiles (two lanes, mutually exclusive)

`src/models/profiles.ts` — a discriminated union: a profile is either sampling-mode (`temperature`) or thinking-mode (`budgetTokens`). Never both (API rejects the combination).

**Critical fix (2026-05-07):** `claude-opus-4-7` requires `thinking.type="adaptive"` (no `budget_tokens`). Earlier models (`claude-sonnet-4-6`) still use `thinking.type="enabled"` with a `budget_tokens` integer. The guard in `src/models/anthropicClient.ts` detects this via `/claude-opus-4/.test(model)`.

| Profile name | Model | Mode | Use |
|---|---|---|---|
| `cheap` | haiku-4-5 | sampling 0.0 | subagent deterministic tasks |
| `chat` | sonnet-4-6 | sampling 0.4 | planner conversation |
| `creative` | sonnet-4-6 | sampling 0.7 | frontend / UI authoring |
| `standard-think` | sonnet-4-6 | enabled thinking 4k | SC agent, most subagents |
| `deep-think` | opus-4-7 | **adaptive** thinking | audit agent, hard debugging |

### Subagent circuit breaker

`src/agents/_runtime/subagentRunner.ts` — `runSubagent()` checks `agent.delegations` before every invocation. If a `(subagent_name, task_signature)` pair has ≥ 3 failure rows in the past hour, it short-circuits with `{ status: "circuit_open" }` without calling the LLM. `taskSignature = sha256(taskDescription).slice(0, 16)`.

---

## Phase completion status

### Phase 0 — Foundation ✅
Thread/run Postgres schema, StacyVM SDK client, FS/bash/forge tool primitives, path scoping, Result<T> contract, streaming translator + printer, CLI harness.

Gate scripts:
- `bun run test:checkpointer` — 5/5 ✅
- `bun run test:circuit-breaker` — 3/3 ✅

### Phase 1 — Smart Contract Agent ✅
Full SC agent with 5 subagents + circuit breaker.

**Architecture fix applied mid-phase** (see `changes.md`):
- Renamed `read_file`/`write_file` → `sandbox_read`/`sandbox_write` etc. to avoid deepagents builtin collision
- Introduced `buildSkillsBackend()` shared helper
- Skills live in `agent-ts/skills/` (not in the container image)

Files:
- `src/agents/smartContract/index.ts` — `createSmartContractAgent()`
- `src/agents/smartContract/tools.ts` — delegates to `_runtime/sandboxFsTools.ts`, adds bash + forge tools
- `src/agents/smartContract/subagents/` — `compile`, `test`, `deploy`, `quickAudit`, `abiExtract` specs
- `src/prompts/base/smart-contract.txt` + 6 fragments
- `src/agents/_runtime/skillsBackend.ts` — `buildSkillsBackend()`, `READ_ONLY_SKILLS_PERMISSIONS`
- `src/agents/_runtime/subagentRunner.ts` — circuit breaker + delegation row persistence
- `src/agents/_runtime/delegateTool.ts` — LLM-callable `task` tool that drives subagents

Gate (live infra needed):
- `bun run test:forge` — needs StacyVM running with `stacy-evm:latest` image
- Full §18 8-step gate — needs `ANTHROPIC_API_KEY` + StacyVM + Sepolia secrets

### Phase 2 — Audit Agent ✅ (typechecks clean; live gate pending)
Single-pass audit agent. No subagents in v0. Read-only on contracts; only write is `write_audit_report` → `/workspace/.audit/`.

Files created:
- `src/tools/audit.ts` — `writeAuditReport()`, `solhintCheck()` (graceful when not installed), re-exports `slitherAudit` from `forge.ts`
- `src/agents/audit/index.ts` — `createAuditAgent()`, mirrors SC factory pattern
- `src/agents/audit/tools.ts` — `buildAllAuditTools()` = 3 read-only sandbox FS tools + `slither_audit` + `write_audit_report`
- `src/agents/audit/reportFormatter.ts` — deterministic markdown formatter (Executive Summary → Findings table → Detailed Analysis → Methodology → Tools → Limitations); primarily for tests/normalization — the LLM writes the markdown directly
- `src/prompts/base/audit.txt` — full audit base prompt
- `src/prompts/fragments/audit-thorough.txt` — default full-pass mode
- `src/prompts/fragments/audit-quick.txt` — slither-only fast mode (triggered by "quick"/"fast"/"lightweight" in message)
- `src/agents/_runtime/sandboxFsTools.ts` — new shared factory; SC's `buildFsTools` now re-exports from here; audit uses `buildReadOnlySandboxFsTools`

Also fixed in this phase:
- **`src/models/anthropicClient.ts`** — Opus 4.7 now uses `thinking.type="adaptive"` instead of `"enabled"` (API changed)

Fragment selection for audit in `createAuditAgent()` (no selector.ts involvement — done inline):
```ts
const fragment = /\b(quick|fast|lightweight)\b/i.test(initialUserMessage) ? "audit-quick" : "audit-thorough";
```

Profile selection already handled by existing `selectProfile.ts`:
```ts
if (input.agent === "audit") {
  if (/\bquick\b/.test(text)) return "standard-think"; // sonnet
  return "deep-think";                                  // opus adaptive
}
```

Live acceptance gate (COMPANION_PRD_PHASES.md §2.4):
```bash
bun run harness --agent audit --new-sandbox --new-thread
> audit the contracts in this project
```
Expect: `read_file('/audit-checklist/SKILL.md')` → `slither_audit` → manual reasoning → one `write_audit_report` call → report at `/workspace/.audit/audit-<ts>-<slug>.md`.

### Phase 3 — Frontend Agent ✅ (typechecks clean; live gate pending)

Five subagents per PRD §9.2. Default profile `creative`; sub-cases for build/lint failures and missing `node_modules` route extra prompt fragments.

Files created:

- `src/tools/bun.ts` — 5 primitives: `bunInstall`, `bunRunBuild`, `bunRunLint`, `bunDevSmoke`, `listFrontendTree`. All return `Result<T>`, never throw. `bunDevSmoke` runs `nohup bun dev` in background, polls `localhost:<port|3000>`, kills, reports.
- `src/agents/_runtime/sandboxBashTool.ts` — shared parameterized `buildBashTool({ defaultCwd, scopeHint })`. SC, FE, Integration all consume it.
- `src/agents/frontend/tools.ts` — `buildAllFeTools()` = sandbox FS (scoped to `/workspace/frontend`) + `bash` + 5 bun tools.
- `src/agents/frontend/index.ts` — `createFrontendAgent()` mirrors SC factory pattern. Probes `/workspace/frontend/node_modules` to set the `freshFrontend` selector flag.
- `src/agents/frontend/subagents/` — `install`, `buildCheck`, `lintFix`, `componentAuthor` (creative profile), `devSmoke` + `index.ts` registry as `FE_SUBAGENTS`.
- `src/prompts/base/frontend.txt` — full FE base prompt with two-FS surface explanation and explicit "do not wire contracts; that's the Integration agent" rule.
- `src/prompts/fragments/frontend-build-failed.txt`, `frontend-lint-failed.txt`, `frontend-fresh-start.txt`.

Live gate (PRD §3.2):

```bash
bun run harness --agent frontend --new-sandbox --new-thread
> Add a Counter component with increment/decrement buttons and a count display. Use Tailwind. Don't wire it to a contract yet — just static UI with local state.
```

Expect: `read_file('/react-component-patterns/SKILL.md')` + `read_file('/tailwind-design/SKILL.md')` → `delegate({ subagent_name: "fe-component-author" })` → `delegate({ subagent_name: "fe-build-check" })` succeeds → `delegate({ subagent_name: "fe-dev-smoke" })` returns `{ success: true, port: 3000, statusCode: 200 }`.

### Phase 4 — Integration Agent ✅ (typechecks clean; live gate pending)

Four subagents per PRD §9.3. Default profile `standard-think`. Scope is **R/W on both** `/workspace/contracts/` and `/workspace/frontend/` per the amendment recorded in `changes.md` — Integration genuinely writes ABI/address caches under `contracts/.deployments/`. Solidity-source discipline is enforced at the prompt layer + by deny-listing `forge_deploy_sepolia`/`forge_test`/`forge_build`/`forge_fmt`/`slither_audit`. Audit's strict read-only stance on contracts is unchanged.

Files created:

- `src/tools/integration.ts` — 3 primitives: `syncAbiToFrontend`, `writeContractAddressConstants` (read-modify-write on `addresses.ts` with regex parser + JSON.parse-with-quote-fixup; falls back gracefully if hand-edited), `listBroadcasts`. Reuses `extractAbi` from `forge.ts`.
- `src/agents/integration/tools.ts` — `buildAllIntegrationTools()` = full R/W `sandbox_*` on both roots + parameterized `bash` (default cwd `/workspace/frontend`) + read-only forge subset (`extract_abi`, `list_contracts`, `read_deployed_address`, `forge_inspect_abi`) + 5 bun tools + 3 integration-only tools (`sync_abi_to_frontend`, `write_contract_address_constants`, `list_broadcasts`).
- `src/agents/integration/index.ts` — `createIntegrationAgent()`. Probes `listBroadcasts` to set the `noDeployments` selector flag.
- `src/agents/integration/subagents/` — `abiSync` (cheap), `addressSync` (cheap), `wagmiSetup` (standard-think), `hookAuthor` (standard-think) + `index.ts` registry as `INTEGRATION_SUBAGENTS`.
- `src/prompts/base/integration.txt` — full base prompt with two-FS surface, standard workflow (`list_broadcasts → int-abi-sync → int-address-sync → int-wagmi-setup → int-hook-author → bun_run_build → bun_dev_smoke`), Sepolia-only rule, hand-off rules.
- `src/prompts/fragments/integration-no-deployments.txt`, `integration-abi-mismatch.txt`.

Live gate (PRD §4.2):

```bash
bun run harness --agent integration --sandbox <id-from-phase-1-with-deployed-counter> --new-thread
> Wire the Counter UI to the deployed Counter contract. Use wagmi and viem. Sepolia only.
```

Expect: `list_broadcasts` returns the Counter run → `delegate({ subagent_name: "int-abi-sync" })` writes `/workspace/frontend/src/abi/Counter.json` → `delegate({ subagent_name: "int-address-sync" })` merges address into `/workspace/frontend/src/lib/addresses.ts` → `delegate({ subagent_name: "int-wagmi-setup" })` scaffolds `lib/wagmi.ts` + Providers → `delegate({ subagent_name: "int-hook-author" })` writes `hooks/useCounter.ts` → `bun_run_build` succeeds → `bun_dev_smoke` returns 200.

### Phase 5–7 — Not started

| Phase | Agent | Key work |
|---|---|---|
| 5 | Planner Agent | PRD parse, task decomposition, AGENTS.md generation |
| 6 | Orchestrator | Sequential delegation, `pauseBetweenPhases`, PRD injection |
| 7 | Memory & Polish | Summarization middleware, long-term memory, cost-bound profile downgrading |

---

## Source file map

```
agent-ts/src/
├── agents/
│   ├── _runtime/
│   │   ├── delegateTool.ts        LLM-callable `delegate` tool → subagentRunner
│   │   ├── sandboxBashTool.ts     Shared parameterized buildBashTool({ defaultCwd, scopeHint })
│   │   ├── sandboxFsTools.ts      Shared sandbox FS tool factory (full + read-only variants)
│   │   ├── skillsBackend.ts       FilesystemBackend for agent-ts/skills/ (read-only)
│   │   ├── subagentRunner.ts      Circuit-breaker runner, recursionLimit = maxLLMCalls × 3,
│   │   │                          stream-mode for state recovery on recursion-limit throws
│   │   └── types.ts               SubagentSpec, SubagentSummary { failureKind: operation|orchestration }
│   ├── audit/
│   │   ├── index.ts               createAuditAgent() factory (no subagents)
│   │   ├── reportFormatter.ts     Deterministic markdown formatter
│   │   └── tools.ts               buildAllAuditTools() — read-only + slither + write_audit_report
│   ├── frontend/                  ← Phase 3
│   │   ├── index.ts               createFrontendAgent() factory
│   │   ├── tools.ts               buildAllFeTools() — sandbox FS + bash + 5 bun tools
│   │   └── subagents/
│   │       ├── index.ts           FE_SUBAGENTS registry
│   │       ├── install.ts         fe-install (cheap)
│   │       ├── buildCheck.ts      fe-build-check (cheap)
│   │       ├── lintFix.ts         fe-lint-fix (standard-think)
│   │       ├── componentAuthor.ts fe-component-author (creative)
│   │       └── devSmoke.ts        fe-dev-smoke (cheap)
│   ├── integration/               ← Phase 4
│   │   ├── index.ts               createIntegrationAgent() factory
│   │   ├── tools.ts               buildAllIntegrationTools() — R/W on both roots,
│   │   │                          read-only forge subset, bun_*, integration-only tools
│   │   └── subagents/
│   │       ├── index.ts           INTEGRATION_SUBAGENTS registry
│   │       ├── abiSync.ts         int-abi-sync (cheap)
│   │       ├── addressSync.ts     int-address-sync (cheap)
│   │       ├── wagmiSetup.ts      int-wagmi-setup (standard-think)
│   │       └── hookAuthor.ts      int-hook-author (standard-think)
│   └── smartContract/
│       ├── index.ts               createSmartContractAgent() factory
│       ├── tools.ts               buildFsTools / buildBashTool / buildForgeTools / buildAllScTools
│       └── subagents/
│           ├── index.ts           SC_SUBAGENTS registry (only sc-test + sc-quick-audit;
│           │                      compile/deploy/abi-extract are direct/composite tool calls)
│           ├── test.ts            sc-test spec
│           └── quickAudit.ts      sc-quick-audit spec
├── cli/
│   ├── args.ts                    Flag parser (--agent audit|smart-contract|frontend|integration|...)
│   ├── runAgent.ts                openAgentRun / runAgentTurn / closeAgentRun
│   └── test-harness.ts            Main CLI entry; dispatches all 4 wired agents
├── memory/
│   ├── checkpointer.ts            PostgresSaver singleton
│   ├── db.ts                      pg Pool singleton
│   ├── runs.ts                    agent.runs CRUD
│   └── threads.ts                 agent.threads CRUD
├── models/
│   ├── anthropicClient.ts         buildModel(profileName) — adaptive vs enabled thinking
│   ├── profiles.ts                PROFILES catalog, AGENT_DEFAULT_PROFILE, PROFILE_DOWNGRADE chain
│   └── selectProfile.ts           Rule-based profile selection per agent/intent
├── prompts/
│   ├── base/
│   │   ├── audit.txt              Audit agent base prompt
│   │   ├── frontend.txt           ← Phase 3 — FE base prompt
│   │   ├── integration.txt        ← Phase 4 — Integration base prompt
│   │   └── smart-contract.txt     SC agent base prompt
│   ├── fragments/
│   │   ├── audit-quick.txt
│   │   ├── audit-thorough.txt
│   │   ├── circuit-breaker-tripped.txt
│   │   ├── deployment-mode.txt
│   │   ├── error-recovery.txt
│   │   ├── fresh-deploy.txt
│   │   ├── frontend-build-failed.txt    ← Phase 3
│   │   ├── frontend-fresh-start.txt     ← Phase 3
│   │   ├── frontend-lint-failed.txt     ← Phase 3
│   │   ├── integration-abi-mismatch.txt ← Phase 4
│   │   ├── integration-no-deployments.txt ← Phase 4
│   │   ├── redeploy.txt
│   │   └── test-debugging.txt
│   ├── composer.ts                composePrompt(base, fragments, agentsMd, sandboxId)
│   └── selector.ts                selectFragments() — rule-based fragment picker
│                                  (handles SC, frontend, integration cases)
├── streaming/
│   ├── events.ts                  AgentEvent discriminated union
│   ├── printer.ts                 printEvent() — ANSI console output
│   └── translator.ts              translateLangGraphEvent() — streamEvents v2 → AgentEvent
└── tools/
    ├── audit.ts                   writeAuditReport, solhintCheck, re-exports slitherAudit
    ├── bash.ts                    bash(sandboxId, cmd, {cwd, timeout}) → Result
    ├── bun.ts                     ← Phase 3 — bunInstall, bunRunBuild, bunRunLint,
    │                              bunDevSmoke (port 3000 default), listFrontendTree
    ├── filesystem.ts              readFile/writeFile/listDir/deleteFile/moveFile/globFiles/statFile
    ├── forge.ts                   forgeBuild/Test/Fmt/InspectAbi, extractAbi, readDeployedAddress,
    │                              forgeDeploySepolia (idempotent), deployContract (composite),
    │                              listContracts, slitherAudit
    ├── integration.ts             ← Phase 4 — syncAbiToFrontend, writeContractAddressConstants
    │                              (regex+JSON.parse RMW on addresses.ts), listBroadcasts
    ├── pathScope.ts               scopeTo(roots) HOC — prevents path escape
    ├── result.ts                  Result<T> = Ok<T> | Err; ok(), err(), fromThrowable()
    └── stacyvmClient.ts           StacyVM SDK client singleton + sandbox cache
```

---

## Skills available to agents

Located in `agent-ts/skills/` (17 directories). Agents navigate with built-in `read_file`/`ls`/`glob` tools.

Audit-relevant: `audit-checklist`, `slither-output-interpretation`, `reentrancy-prevention`, `access-control-patterns`, `gas-optimization`

SC-relevant: `forge-deployment-troubleshooting`, `foundry-test-patterns`, `solidity-debugging`, `storage-layout`, `abi-extraction`

Frontend-relevant: `react-component-patterns`, `tailwind-design`, `viem-client-config`, `wagmi-hooks-patterns`, `metamask-connection`, `contract-event-listening`

---

## Common operations

```bash
# typecheck
cd agent-ts && bun run typecheck

# run a gate test (requires DATABASE_URL)
DATABASE_URL=postgresql://stacyvm:stacyvm@localhost:5432/stacyvm bun run test:circuit-breaker

# run the audit agent (requires ANTHROPIC_API_KEY + StacyVM running)
ANTHROPIC_API_KEY=... STACYVM_URL=... bun run harness --agent audit --new-sandbox --new-thread

# run the SC agent
ANTHROPIC_API_KEY=... STACYVM_URL=... bun run harness --agent smart-contract --new-sandbox --new-thread

# run the frontend agent (Next.js starter at /workspace/frontend)
ANTHROPIC_API_KEY=... STACYVM_URL=... bun run harness --agent frontend --new-sandbox --new-thread

# run the integration agent (reuse a sandbox with deployed contracts + scaffolded UI)
ANTHROPIC_API_KEY=... STACYVM_URL=... bun run harness --agent integration --sandbox <id> --new-thread
```

---

## Known issues / gotchas

1. **`claude-opus-4-7` requires adaptive thinking** — `thinking.type="enabled"` raises an API error. Fixed in `anthropicClient.ts` with a `/claude-opus-4/.test(model)` guard. Sonnet 4.6 still uses "enabled".

2. **StacyVM SDK `ExecOptions`** uses `workdir` (not `cwd`) and `timeout` as a string (e.g., `"30s"`, `"2m"`). The `execStream` variant does not accept `timeout` at all.

3. **PostgresSaver** requires `DATABASE_URL` in env. Missing it gives an unhelpful undefined error at checkpointer setup.

4. **Subagents must receive the same `backend` + `permissions`** as the parent agent. If omitted, the built-in `read_file` falls back to `StateBackend` (in-memory, empty) and skill reads silently return nothing.

5. **`subagentRunner` recursion formula is `maxLLMCalls × 3`**, not ×2. deepagents always injects `todoListMiddleware`, which adds `write_todos` calls as separate graph nodes on top of model+tools. Under-counting fires the recursion limit on happy-path runs of ≥5-step tasks. The runner streams via `streamMode: "values"` so it can recover the last assistant message even when the recursion limit throws (see `subagentRunner.ts:153-223`).

6. **`bun_dev_smoke` defaults to port 3000 (Next.js), not 5173 (Vite)**. The dev-base image ships a Next.js starter — see `changes.md` Phase 3 + 4 amendment. The tool accepts a `port` arg for projects that override.

7. **Integration agent has R/W on `/workspace/contracts/` (not just frontend)**. Solidity-source discipline is enforced at the prompt layer + by deny-listing `forge_deploy_sepolia`/`forge_test`/`forge_build`/`forge_fmt`/`slither_audit`. Audit's strict read-only stance on contracts is unchanged. See `changes.md` Phase 3 + 4 amendment.

8. **SC subagent registry is now 2 specs**, not 5. `sc-compile` / `sc-deploy` / `sc-abi-extract` were promoted to direct/composite tool calls (`forge_build`, `deploy_contract`, `extract_abi`). Only `sc-test` and `sc-quick-audit` remain as subagents. See `changes.md` for the rationale (mechanical work doesn't earn the LLM-isolation overhead).

9. **`bash` factory is now shared at `_runtime/sandboxBashTool.ts`**. SC, FE, and Integration each call `buildBashTool({ defaultCwd })` with their own scope. SC's `tools.ts` re-exports under the original name for backward compatibility.

For deeper subagent / runner / deploy-flow change history, see `agent-ts/changes.md`.
