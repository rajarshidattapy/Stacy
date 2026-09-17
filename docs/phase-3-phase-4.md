# Phases 3 & 4 — Frontend Agent + Integration Agent

## Context

Phases 0–2 are complete (Foundation, Smart Contract agent with 5 subagents, Audit agent single-pass). The user wants Phases 3 (Frontend) and 4 (Integration) done in one pass. Both agents follow the same factory pattern verified working in `src/agents/smartContract/index.ts` and `src/agents/audit/index.ts`:

```
selectProfile → selectFragments → tryReadAgentsMd → composePrompt
  → buildAll{X}Tools (+ optional buildDelegateTool with subagent registry)
  → buildModel(profile) → getCheckpointer
  → createDeepAgent({ model, tools, systemPrompt, backend: buildSkillsBackend(), permissions: READ_ONLY_SKILLS_PERMISSIONS, checkpointer })
```

Infrastructure already in place that we do NOT touch:
- Profile catalog (`src/models/profiles.ts`): `AGENT_DEFAULT_PROFILE` already has `frontend: "creative"` and `integration: "standard-think"`. `selectProfile.ts` has frontend logic; integration falls through to default.
- Skills (`agent-ts/skills/`, 17 dirs): all FE-relevant (`react-component-patterns`, `tailwind-design`, `viem-client-config`, `wagmi-hooks-patterns`, `metamask-connection`, `contract-event-listening`, `bun-dependency-management`) and integration-relevant skills exist.
- `buildSkillsBackend()` + `READ_ONLY_SKILLS_PERMISSIONS` + `buildSandboxFsTools()` + circuit-breaker subagent runner + `buildDelegateTool` are all proven on the SC agent.
- Container starter is **Next.js 16** + Tailwind 4 + wagmi 3.6 + viem 2 + TanStack Query 5 + MetaMask connector at `/workspace/frontend/`. Bun is preinstalled on the dev base. (Source: `stacyvm/images/evm/Dockerfile`.)

### PRD amendments adopted via this plan (record in `agent-ts/changes.md`)

1. **`bun_dev_smoke` defaults port to 3000, not 5173** — PRD §8.3 specified 5173 (Vite), but the actual starter image is Next.js. Tool gets an optional `port?: number` arg; default 3000.
2. **Integration agent gets full R/W on both `/workspace/contracts/` and `/workspace/frontend/`** — relaxed from PRD §4.4's "read-only on contracts" stance. Rationale: the integration agent re-extracts ABIs (writes `/workspace/contracts/.deployments/<name>.abi.json`) and may rewrite broadcast-derived helpers; preventing contract writes blocks legitimate integration work. The Audit agent retains its strict read-only contract scope; only Integration is broadened.

Also update PRD §4.4 (or §9.3) text inline to mark Integration's scope as "R/W on /workspace/{contracts,frontend}/", citing changes.md.

---

## Phase 3 — Frontend Agent

### 3.1 Create `src/tools/bun.ts`

Five primitives (mirror `src/tools/forge.ts` shape — `Result<T>` return, never throw, parse stdout into structured fields):

```ts
export interface BunBuildResult { success: boolean; warnings: string[]; errors: string[]; raw: string }
export interface BunLintResult  { success: boolean; issues: { file, line?, rule?, message }[]; raw: string }
export interface BunInstallResult { success: boolean; added: string[]; warnings: string[]; raw: string }
export interface BunDevSmokeResult { success: boolean; port: number; statusCode?: number; bootMs?: number; raw: string }
export interface FrontendTreeNode { path: string; type: "file" | "dir"; children?: FrontendTreeNode[] }

bunInstall(sandboxId, opts?: { cwd?: string }): Promise<Result<BunInstallResult>>
  // bash: cd <cwd|/workspace/frontend> && bun install. Parse "+ pkg@x.y.z" lines.

bunRunBuild(sandboxId, opts?: { cwd?: string }): Promise<Result<BunBuildResult>>
  // bash: cd <cwd> && bun run build. Capture exit code. Extract Next.js error/warning blocks.

bunRunLint(sandboxId, opts?: { cwd?: string }): Promise<Result<BunLintResult>>
  // bash: cd <cwd> && bun run lint. Parse ESLint default formatter output.

bunDevSmoke(sandboxId, opts?: { cwd?: string; port?: number; timeoutMs?: number }): Promise<Result<BunDevSmokeResult>>
  // 1. start `bun dev` in background — `nohup bun dev > /tmp/bun-dev.log 2>&1 & echo $!` and capture PID.
  // 2. poll http://localhost:<port|3000>/ via curl until 200 or timeout (10s default).
  // 3. kill -TERM <pid>; wait; kill -KILL <pid> if still alive. Always finalize with `pkill -f "bun dev"`.
  // 4. return { success, port, statusCode, bootMs }.

listFrontendTree(sandboxId, opts?: { cwd?: string; maxDepth?: number }): Promise<Result<{ tree: FrontendTreeNode }>>
  // bash: find <cwd|/workspace/frontend> -path '*/node_modules' -prune -o -path '*/.next' -prune -o -print
  // Build tree by sorted paths. Depth cap default 6.
```

All take an optional `cwd` (default `/workspace/frontend`) so the integration agent can reuse them.

### 3.2 Create `src/agents/frontend/tools.ts`

Mirror `src/agents/smartContract/tools.ts`:

```ts
export function buildFsTools(sandboxId: string): StructuredToolInterface[] {
  return buildSandboxFsTools(sandboxId, { roots: ["/workspace/frontend"] });
}

export function buildBashTool(sandboxId: string): StructuredToolInterface
  // name: "bash", default cwd: /workspace/frontend

export function buildBunTools(sandboxId: string): StructuredToolInterface[]
  // 5 tools wrapping bun.ts: bun_install, bun_run_build, bun_run_lint, bun_dev_smoke, list_frontend_tree

export function buildAllFeTools(sandboxId: string): StructuredToolInterface[]
  // [...buildFsTools, buildBashTool, ...buildBunTools]
```

### 3.3 Create FE subagent specs in `src/agents/frontend/subagents/`

Per PRD §9.2, each is a `SubagentSpec` (shape from `src/agents/_runtime/types.ts`):

| File | name | tools (filter from full FE tool set) | profile | maxLLMCalls |
|---|---|---|---|---|
| `install.ts` | `fe-install` | `bun_install`, `sandbox_read` | `cheap` | 6 |
| `buildCheck.ts` | `fe-build-check` | `bun_run_build`, `sandbox_read` | `cheap` | 6 |
| `lintFix.ts` | `fe-lint-fix` | `bun_run_lint`, `sandbox_read`, `sandbox_write` | `standard-think` | 12 |
| `componentAuthor.ts` | `fe-component-author` | `sandbox_read`, `sandbox_write`, `sandbox_ls`, `list_frontend_tree` | `creative` | 16 |
| `devSmoke.ts` | `fe-dev-smoke` | `bun_dev_smoke` | `cheap` | 4 |

Plus `subagents/index.ts` with `FE_SUBAGENTS` registry, mirroring SC's pattern.

### 3.4 Create `src/prompts/base/frontend.txt`

Sections (mirror `src/prompts/base/smart-contract.txt`):
- **Identity** — "You are the Frontend Agent. You author and iterate on the React/Next.js frontend at `/workspace/frontend/`. You DO NOT modify Solidity contracts."
- **Tool surfaces** (the two-FS split): `read_file`/`ls`/`glob`/`grep` → skills (start with `react-component-patterns`, `tailwind-design`); `sandbox_*` → user project. Mention skills relevant per task.
- **Scope rule** — only `/workspace/frontend/`. Never touch `/workspace/contracts/`. If a task implies contract changes, surface and stop.
- **Subagent delegation** — use `delegate` for `fe-install`/`fe-build-check`/`fe-lint-fix`/`fe-component-author`/`fe-dev-smoke`. Author components inline only for small edits; delegate to component-author for new files >50 lines.
- **Naming flexibility** — don't hardcode "Counter".
- **Deliverable rule** — every session must end with a green `bun_run_build` and (for new components) a passing `bun_dev_smoke`.

### 3.5 Create FE prompt fragments in `src/prompts/fragments/`

- `frontend-build-failed.txt` — when last `bun_run_build` failed: read error block, do not delegate randomly, look at imports/types first.
- `frontend-lint-failed.txt` — when lint reports issues: prefer `fe-lint-fix` subagent.
- `frontend-fresh-start.txt` — if `node_modules` missing: run `fe-install` first.

### 3.6 Create `src/agents/frontend/index.ts`

Direct copy of SC factory with substitutions:
- `selectProfile({ agent: "frontend", lastUserMessage })`
- `selectFragments({ agent: "frontend", ... })`
- `tryReadAgentsMd` reads `/workspace/AGENTS.md` + `/workspace/frontend/AGENTS.md`
- `composePrompt({ base: "frontend", ... })`
- `buildAllFeTools(sandboxId)` + `buildDelegateTool({ ..., registry: FE_SUBAGENTS })`

### 3.7 Wire CLI: edit `src/cli/test-harness.ts`

Add after the `audit` branch (around line 138):
```ts
} else if (args.agent === "frontend") {
  if (!sandbox) throw new Error("frontend agent requires a sandbox");
  buildAgent = async (firstUserMessage, parentRunId) =>
    createFrontendAgent({ sandboxId: sandbox.id, threadId: thread.id, parentRunId,
      initialUserMessage: firstUserMessage, profileOverride: args.profile ?? undefined });
}
```
Plus `import { createFrontendAgent } from "../agents/frontend/index.ts";` at top.

### 3.8 Update `src/prompts/selector.ts`

Add a `case "frontend":` block emitting `frontend-build-failed` / `frontend-lint-failed` / `frontend-fresh-start` based on state. Falls through to `[]` otherwise.

`selectProfile.ts` already has frontend logic — no change needed.

---

## Phase 4 — Integration Agent

### 4.1 Create `src/tools/integration.ts`

Three primitives. Reuse `extractAbi` from `src/tools/forge.ts` directly. Two genuinely new tools:

```ts
syncAbiToFrontend(sandboxId, args: { contractFile: string; contractName: string; outDir?: string }):
  Promise<Result<{ source: string; destination: string; bytes: number }>>
  // 1. await extractAbi(sandboxId, args)  → /workspace/contracts/.deployments/<name>.abi.json
  // 2. read that file, write to <outDir|/workspace/frontend/src/abi>/<contractName>.json (mkdir -p)

writeContractAddressConstants(sandboxId, args: {
  contractName: string; address: string; chainId: number; targetPath?: string
}): Promise<Result<{ path: string; merged: Record<number, Record<string, string>> }>>
  // targetPath default /workspace/frontend/src/lib/addresses.ts
  // Strategy: regex-extract the existing `addresses` object literal, JSON.parse with quote fixup.
  // If parsing fails, fall back to a fresh object containing only the new entry. Don't crash.
  // Write deterministic output:
  //   `// Auto-generated by integration agent. Do not edit by hand.\nexport const addresses = ${JSON.stringify(merged, null, 2)} as const;\n`

listBroadcasts(sandboxId): Promise<Result<{ runs: Array<{
  scriptName: string; chainId: number; runFile: string; deployedContracts: { name: string; address: string }[]
}> }>>
  // globFiles(/workspace/contracts/broadcast/**/run-latest.json) → readFile each → parse → extract.
```

### 4.2 Create `src/agents/integration/tools.ts`

```ts
export function buildFsToolsForIntegration(sandboxId: string): StructuredToolInterface[] {
  // Full R/W on BOTH /workspace/contracts and /workspace/frontend (per amendment).
  return buildSandboxFsTools(sandboxId, { roots: ["/workspace/contracts", "/workspace/frontend"] });
}

export function buildIntegrationOnlyTools(sandboxId: string): StructuredToolInterface[]
  // sync_abi_to_frontend, write_contract_address_constants, list_broadcasts (3 tools)

export function buildSelectForgeTools(sandboxId: string): StructuredToolInterface[]
  // import buildForgeTools from "../smartContract/tools.ts" then filter to:
  // ["extract_abi", "list_contracts", "read_deployed_address", "forge_inspect_abi"]
  // NOT forge_deploy_sepolia / forge_test / forge_build / forge_fmt / slither_audit.

export function buildBunToolsForIntegration(sandboxId: string): StructuredToolInterface[]
  // re-export buildBunTools from "../frontend/tools.ts" (or import from src/tools/bun.ts).
  // All five FE tools available — integration may need bun_install (lockfile changes), bun_run_build, bun_dev_smoke.

export function buildAllIntegrationTools(sandboxId: string): StructuredToolInterface[]
  // [
  //   ...buildFsToolsForIntegration(sandboxId),
  //   buildBashTool(sandboxId, { defaultCwd: "/workspace/frontend" }),
  //   ...buildSelectForgeTools(sandboxId),
  //   ...buildBunToolsForIntegration(sandboxId),
  //   ...buildIntegrationOnlyTools(sandboxId),
  // ]
```

Refactor note: `buildBashTool` in `src/agents/smartContract/tools.ts` currently hardcodes `/workspace/contracts`. Parameterize it to accept `{ defaultCwd: string }`. SC passes `/workspace/contracts`, FE passes `/workspace/frontend`, integration passes `/workspace/frontend`. Or simpler — define the bash factory once in a small shared module and have all three import it.

### 4.3 Create integration subagent specs in `src/agents/integration/subagents/`

Per PRD §9.3:

| File | name | tools | profile | maxLLMCalls |
|---|---|---|---|---|
| `abiSync.ts` | `int-abi-sync` | `extract_abi`, `sync_abi_to_frontend`, `list_contracts` | `cheap` | 6 |
| `addressSync.ts` | `int-address-sync` | `read_deployed_address`, `write_contract_address_constants`, `list_broadcasts` | `cheap` | 6 |
| `wagmiSetup.ts` | `int-wagmi-setup` | `sandbox_read`, `sandbox_write`, `sandbox_ls`, `list_frontend_tree` | `standard-think` | 12 |
| `hookAuthor.ts` | `int-hook-author` | `sandbox_read`, `sandbox_write` | `standard-think` | 12 |

Plus `subagents/index.ts` with `INTEGRATION_SUBAGENTS` registry.

### 4.4 Create `src/prompts/base/integration.txt`

- **Identity** — "You are the Integration Agent. You wire deployed Solidity contracts to the Next.js frontend using wagmi + viem. You may modify both `/workspace/contracts/.deployments/*` and `/workspace/frontend/`, but you do NOT change Solidity sources or redeploy contracts."
- **Tool surfaces** — `sandbox_*` covers BOTH contracts and frontend; `bash` defaults cwd to frontend; `extract_abi` etc. operate on contracts.
- **Skills to load first** — `abi-extraction`, `wagmi-hooks-patterns`, `viem-client-config` always; `contract-event-listening` if event-driven UI; `metamask-connection` if wallet flow not present.
- **Workflow** — typically: `list_broadcasts` → `int-abi-sync` per contract → `int-address-sync` per contract → `int-wagmi-setup` (config + provider once) → `int-hook-author` per function group → `bun_run_build` → `bun_dev_smoke`.
- **Sepolia-only** — chainId 11155111 unless user explicitly requests another.
- **Hand-off rule** — if a contract call/event signature is missing or wrong on the FE side, ask the user; do NOT modify Solidity to compensate.

### 4.5 Create integration prompt fragments

- `integration-abi-mismatch.txt` — function-signature drift between deployed contract and existing FE hook.
- `integration-no-deployments.txt` — when `list_broadcasts` is empty.

### 4.6 Create `src/agents/integration/index.ts`

Same factory pattern. Subagent registry passed to delegate tool.

### 4.7 Wire CLI: edit `src/cli/test-harness.ts`

Add `integration` branch alongside `frontend`.

### 4.8 Update `src/prompts/selector.ts` and `selectProfile.ts`

- `selector.ts`: add `case "integration":` block (emit `integration-no-deployments` when last `list_broadcasts.runs` is empty; `integration-abi-mismatch` only on explicit state flag for now).
- `selectProfile.ts`: add explicit `case "integration": return "standard-think"` (currently falls through).

---

## Files NOT to modify

- `src/tools/forge.ts` — `extractAbi`, `listContracts`, `readDeployedAddress`, `forgeInspectAbi` reused as-is.
- `src/agents/_runtime/{subagentRunner,delegateTool,sandboxFsTools,skillsBackend}.ts` — proven; reused unchanged.
- `src/memory/*` — checkpointer, threads, runs all reused.
- `src/streaming/*` — no new event types needed.
- `agent-ts/skills/*` — all required skills exist.
- `stacyvm/images/evm/Dockerfile` — Bun + Next.js starter already present.

## Files to MODIFY

| Path | Change |
|---|---|
| `src/agents/smartContract/tools.ts` | Refactor `buildBashTool` to accept `{ defaultCwd }`. |
| `src/cli/test-harness.ts` | Add `frontend` and `integration` dispatch + imports. |
| `src/prompts/selector.ts` | Add `frontend` and `integration` case blocks. |
| `src/models/selectProfile.ts` | Add explicit `case "integration"`. |
| `agent-ts/changes.md` | Append two amendments: dev-smoke port=3000; integration R/W on both dirs. |
| `agent-ts/AGENT_SYSTEM_PRD.md` | §8.3 (port note) + §4.4 / §9.3 (integration scope clarification). |
| `agent-ts/PROGRESS.md` | Mark Phase 3 + Phase 4 ✅ with file inventory at end. |

## Files to CREATE

```
src/tools/bun.ts
src/tools/integration.ts
src/prompts/base/frontend.txt
src/prompts/base/integration.txt
src/prompts/fragments/frontend-build-failed.txt
src/prompts/fragments/frontend-lint-failed.txt
src/prompts/fragments/frontend-fresh-start.txt
src/prompts/fragments/integration-abi-mismatch.txt
src/prompts/fragments/integration-no-deployments.txt
src/agents/frontend/index.ts
src/agents/frontend/tools.ts
src/agents/frontend/subagents/index.ts
src/agents/frontend/subagents/install.ts
src/agents/frontend/subagents/buildCheck.ts
src/agents/frontend/subagents/lintFix.ts
src/agents/frontend/subagents/componentAuthor.ts
src/agents/frontend/subagents/devSmoke.ts
src/agents/integration/index.ts
src/agents/integration/tools.ts
src/agents/integration/subagents/index.ts
src/agents/integration/subagents/abiSync.ts
src/agents/integration/subagents/addressSync.ts
src/agents/integration/subagents/wagmiSetup.ts
src/agents/integration/subagents/hookAuthor.ts
```

## Critical reuses

| Need | Source |
|---|---|
| Sandbox FS tools (`sandbox_*`) | `buildSandboxFsTools(sandboxId, { roots })` from `src/agents/_runtime/sandboxFsTools.ts` |
| Skills FS backend | `buildSkillsBackend()` + `READ_ONLY_SKILLS_PERMISSIONS` from `src/agents/_runtime/skillsBackend.ts` |
| Prompt composition | `composePrompt({ base, fragments, agentsMd, sandboxId })` from `src/prompts/composer.ts` |
| Profile catalog | `selectProfile`, `buildModel` — no API changes |
| Subagent runner + circuit breaker | `runSubagent` from `src/agents/_runtime/subagentRunner.ts` |
| Delegate tool | `buildDelegateTool({ parentRunId, sandboxId, threadId, registry })` from `src/agents/_runtime/delegateTool.ts` |
| Forge primitives (extractAbi etc.) | `src/tools/forge.ts` exports |
| Result contract | `Result<T>` from `src/tools/result.ts` |
| Bash + filesystem | `src/tools/bash.ts`, `src/tools/filesystem.ts` |

## Architecture-correctness checks

- ✅ No tool-name collisions with deepagents builtins. New tools: `bun_install`, `bun_run_build`, `bun_run_lint`, `bun_dev_smoke`, `list_frontend_tree`, `sync_abi_to_frontend`, `write_contract_address_constants`, `list_broadcasts`.
- ✅ Skills backend stays read-only.
- ✅ Built-in `write_file` / `edit_file` denied — agents can't mutate the skills tree.
- ✅ FE agent path-scoped to `/workspace/frontend/`. Integration scope deliberately broadened, recorded as PRD amendment.
- ✅ Subagent profiles follow PRD: `cheap` for deterministic tasks, `creative` for component author, `standard-think` for lint-fix / wagmi-setup / hook-author.
- ✅ Circuit breaker inherited automatically — every subagent call goes through `runSubagent`.

## Verification

### Static (no live infra needed)

```bash
cd agent-ts && bun run typecheck
```
Must be clean. Catches: bad imports, missing exports, schema mismatches, profile-name typos.

### Phase 3 acceptance gate (live)

Requires `ANTHROPIC_API_KEY` + StacyVM running with the EVM image:

```bash
ANTHROPIC_API_KEY=… STACYVM_URL=… bun run harness --agent frontend --new-sandbox --new-thread
> Add a Counter component with increment/decrement buttons and a count display. Use Tailwind. Don't wire it to a contract yet — just static UI with local state.
```

Expected event sequence:
- `read_file('/react-component-patterns/SKILL.md')` and `read_file('/tailwind-design/SKILL.md')`
- `delegate({ subagent_name: "fe-component-author", task_description: "..." })`
- subagent uses `sandbox_write` to author component file
- parent calls `delegate({ subagent_name: "fe-build-check" })` → `bun_run_build` returns success
- parent calls `delegate({ subagent_name: "fe-dev-smoke" })` → `bun_dev_smoke` returns `{ success: true, port: 3000, statusCode: 200 }`

Manual: `curl <preview-url>` returns 200 and the counter component renders.

### Phase 4 acceptance gate (live)

Reuse the sandbox from Phase 1 (deployed Counter, broadcast file present) and Phase 3 (Counter UI):

```bash
bun run harness --agent integration --sandbox <id> --thread <new>
> Wire the Counter UI to the deployed Counter contract. Use wagmi and viem. Sepolia only.
```

Expected:
- `list_broadcasts` returns the Counter run
- `delegate({ subagent_name: "int-abi-sync" })` → `/workspace/frontend/src/abi/Counter.json` exists
- `delegate({ subagent_name: "int-address-sync" })` → `/workspace/frontend/src/lib/addresses.ts` contains `{ 11155111: { Counter: "0x..." } }`
- `delegate({ subagent_name: "int-wagmi-setup" })` → wagmi config + provider scaffolded
- `delegate({ subagent_name: "int-hook-author" })` → Counter component now uses wagmi hooks
- `bun_run_build` and `bun_dev_smoke` both succeed

Manual end-to-end: open preview URL, connect MetaMask to Sepolia, click increment → verify on-chain via `cast call` or block explorer.

## Out of scope

- Phase 5+ (Planner, Orchestrator, Memory) — explicit user instruction stops at Phase 4.
- A new sandbox image variant — current EVM image already includes Bun + Next.js starter.
- Replacing the Next.js starter with Vite to match PRD §8.3 verbatim — handled instead by amending the PRD.
- Auto-detecting non-default frontend ports beyond an optional `port` arg — defer until a real project hits this.
- Full TS-AST parsing in `writeContractAddressConstants` — regex + JSON.parse fallback is good enough for v0.
