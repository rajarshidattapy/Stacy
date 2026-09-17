# PRD — Agent System for AI-Assisted Smart Contract IDE

**Scope:** This document specifies *only* the agents and their immediate runtime concerns. It does not cover the central backend, the agentic server, container orchestration (StacyVM), the frontend, or payments. Those are designed elsewhere.

**Implementation target:** TypeScript, LangGraph Deep Agents (`deepagents` JS SDK), Anthropic models only. Container interaction via StacyVM REST API at `http://localhost:7423` for local development.

**Build philosophy:** Build the Smart Contract agent first and prove it can write, compile, and deploy a real contract end-to-end via a manual CLI before touching anything else. Everything else is downstream of getting that one path solid.

---

## 1. Mission

The agent system has six agents, each with a precise scope. Three of them (Smart Contract, Frontend, Integration) are domain specialists that operate inside a user's container and are normally invoked through an Orchestrator. Two (Planner, Audit) are independent agents with no upstream dependency on the Orchestrator and are invoked directly. The sixth, the Orchestrator itself, is the conductor that reads an approved PRD and runs the specialists in sequence to bring a project from spec to deployed-and-integrated.

Every agent must support: dynamic system prompts assembled from base + sub-prompts, dynamic model config (model choice, temperature, reasoning effort) chosen per intent, full event streaming (thinking, tool calls, todo updates, subagent spawns), persistent thread memory in Postgres with automatic summarization, and isolated subagent contexts that return summaries to parents.

---

## 2. Architecture at a Glance

```
┌────────────────────────────────────────────────────────────────┐
│                    INDEPENDENT AGENTS                           │
│  ┌────────────────────┐         ┌────────────────────────────┐ │
│  │  Planner Agent     │         │  Audit Agent               │ │
│  │  (no container)    │         │  (read-only on contracts/) │ │
│  │  Output: PRD.md    │         │  Output: audit-report.md   │ │
│  └────────────────────┘         └────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│              ORCHESTRATED AGENTS (inside container)             │
│                                                                  │
│              ┌─────────────────────────────┐                    │
│              │     Orchestrator Agent      │                    │
│              │  Reads PRD, plans todos,    │                    │
│              │  delegates sequentially     │                    │
│              └──────────────┬──────────────┘                    │
│                             │                                    │
│        ┌────────────────────┼────────────────────┐              │
│        ▼                    ▼                    ▼              │
│  ┌──────────┐         ┌──────────┐         ┌──────────────┐    │
│  │  Smart   │  then   │ Frontend │  then   │ Integration  │    │
│  │ Contract │ ──────▶ │  Agent   │ ──────▶ │   Agent      │    │
│  │  Agent   │         │          │         │              │    │
│  └────┬─────┘         └────┬─────┘         └──────┬───────┘    │
│       │                    │                       │            │
│  ┌────▼────┐          ┌────▼─────┐           ┌────▼────┐       │
│  │ task-   │          │ task-    │           │ task-   │       │
│  │ specific│          │ specific │           │ specific│       │
│  │ sub-    │          │ sub-     │           │ sub-    │       │
│  │ agents  │          │ agents   │           │ agents  │       │
│  └─────────┘          └──────────┘           └─────────┘       │
└────────────────────────────────────────────────────────────────┘
```

The Smart Contract / Frontend / Integration agents are full LangGraph harnesses with their own subagents, not lightweight delegates. When the Orchestrator delegates to one of them, it spawns that harness as a subgraph, passes a focused task plus relevant context, and receives a structured summary back. The user can also invoke any of these specialists directly (slash command or UI button) without going through the Orchestrator.

---

## 3. Agent Roster

### 3.1 Planner Agent
**Trigger:** User starts a new project.
**Container:** None — runs purely in the agent backend.
**Responsibility:** Iterative conversation with the user to produce a comprehensive `PRD.md`. Continues until the user explicitly approves. The PRD is not high-level marketing copy — it includes concrete implementation context for all three downstream tiers (contracts, frontend, integration) so that downstream agents can rely on it as their primary source of truth.

The PRD it produces must contain at minimum: project overview and goals, expected contract functionality (state variables, functions, events, modifiers), security considerations specific to the contract logic, deployment expectations (constructor args, network = Sepolia, post-deploy verification steps), required frontend pages and components, wallet interaction requirements, wagmi/viem integration expectations, network constraints, ABI/address flow expectations, and user interaction flows that span frontend ↔ contract.

**Tools:** Conversational only — no file I/O against a container, no exec. Optionally a read-only template lookup tool that fetches starter templates from the central backend's filesystem.

**Output location:** Returns the final PRD content as a string to the central backend, which writes it into `/workspace/PRD.md` of the freshly spawned container before the Orchestrator kicks off.

### 3.2 Orchestrator Agent
**Trigger:** Container is provisioned with PRD.md present, Orchestrator is spawned.
**Container:** Full access via StacyVM tools, but its primary job is reading and delegating, not coding.
**Responsibility:** On first invocation, reads `/workspace/PRD.md`, generates a structured todo list using Deep Agents' `write_todos` tool, then begins executing in three sequential stages: contracts → frontend → integration. Each stage delegates to the relevant specialist as a subagent and waits for the structured summary before moving on.

After the initial PRD-driven kickoff completes, the Orchestrator transitions to interactive mode. New user messages arrive in the same thread; the Orchestrator decides which specialist to delegate to (or handles it directly for cross-cutting changes).

**Special property:** The Orchestrator is never the agent that writes contract code or frontend code. It always delegates. This keeps its context small and focused on planning and coordination.

### 3.3 Smart Contract Agent
**Trigger:** Delegated by Orchestrator, or invoked directly by user (e.g., "fix the failing test").
**Container scope:** Restricted to `/workspace/contracts/`.
**Responsibility:** Authors Solidity, runs the Foundry build/test/deploy lifecycle, extracts ABIs, persists deployed addresses. Has its own set of focused subagents.

### 3.4 Frontend Agent
**Trigger:** Delegated by Orchestrator after contracts are deployable, or invoked directly.
**Container scope:** Restricted to `/workspace/frontend/`.
**Responsibility:** UI/UX work, fixes frontend bugs, sets up component structure, manages bun dependencies. Does not touch contract logic.

### 3.5 Integration Agent
**Trigger:** Delegated by Orchestrator after both contracts are deployed and frontend has component scaffolding.
**Container scope:** Read-write on both `/workspace/contracts/` and `/workspace/frontend/`. The integration toolchain genuinely writes into `/workspace/contracts/.deployments/` (ABI + address caches) so blanket read-only on contracts blocks legitimate work. Solidity sources stay off-limits via prompt rules + a deny-list on the forge tool subset (no `forge_deploy_sepolia`, `forge_test`, `forge_build`, `forge_fmt`, `slither_audit` exposed to integration). Audit retains its strict read-only stance on contracts; only Integration is broadened. See `agent-ts/changes.md` → "Phase 3 + 4 amendments" for the full rationale.
**Responsibility:** Wires the deployed contract to the frontend via wagmi + viem. Pulls ABI from Foundry artifacts, copies it to a known frontend location, writes contract address constants, scaffolds the wagmi config and interaction hooks. Never modifies Solidity sources or redeploys — if an interface mismatch surfaces, hands off to the user (the SC agent owns Solidity).

### 3.6 Audit Agent
**Trigger:** User clicks an explicit "Audit" button or types `/audit`. Never invoked by the Orchestrator automatically.
**Container scope:** Read-only on `/workspace/contracts/`. Cannot write to source files.
**Responsibility:** Produces a structured audit report at `/workspace/.audit/audit-{timestamp}.md`. The report covers: Slither findings, manual reasoning about reentrancy / access control / arithmetic / storage layout / external calls / oracle dependencies, gas inefficiency observations, and a severity-ranked summary. The user reviews the report and copy-pastes findings to the Smart Contract agent for remediation. Audit does not edit code.

---

## 4. Filesystem Layout

The agent system reads from **two distinct filesystems**, intentionally separated. Skills live with the agent code, not in the container image — this keeps the StacyVM image bare, lets skills version with code deploys, and avoids image rebuilds when a SKILL.md changes.

### 4.1 Agent backend host (where agent processes run)

```
agent-ts/
  skills/                        # Read-only by the LLM (enforced via deepagents permissions)
    solidity-debugging/SKILL.md
    gas-optimization/SKILL.md
    reentrancy-prevention/SKILL.md
    access-control-patterns/SKILL.md
    storage-layout/SKILL.md
    forge-deployment-troubleshooting/SKILL.md
    abi-extraction/SKILL.md
    foundry-test-patterns/SKILL.md
    bun-dependency-management/SKILL.md
    react-component-patterns/SKILL.md
    tailwind-design/SKILL.md
    wagmi-hooks-patterns/SKILL.md
    viem-client-config/SKILL.md
    metamask-connection/SKILL.md
    contract-event-listening/SKILL.md
    audit-checklist/SKILL.md
    slither-output-interpretation/SKILL.md
  src/                           # agent code
```

Each agent boots with a deepagents `FilesystemBackend({ rootDir: agent-ts/skills, virtualMode: true })` plus a deny-write `permissions` rule. The deepagents built-in tools (`ls`, `read_file`, `glob`, `grep`) read this tree on demand. From the LLM's perspective, the skills tree appears mounted at `/`.

### 4.2 StacyVM container (per user job)

```
/workspace/                      # User project, mutable
  PRD.md                         # injected by central backend pre-kickoff
  AGENTS.md                      # project-wide memory (orchestrator-curated)
  contracts/
    AGENTS.md                    # contract-specific conventions
    src/                         # Solidity sources
    test/                        # Foundry tests
    script/                      # Deploy scripts
    foundry.toml
    .env                         # RPC_URL, PRIVATE_KEY (provisioned by backend)
    out/                         # build artifacts (gitignored)
    broadcast/                   # deployment records
    .deployments/                # custom: persisted deployed addresses per network
  frontend/
    AGENTS.md                    # frontend-specific conventions
    src/
    public/
    package.json
    bun.lockb
  .agent/                        # agent runtime state, hidden from user
    todos.json                   # current todos (managed by write_todos tool)
    delegation-log.jsonl         # which subagent ran what, append-only
  .audit/                        # audit reports
    audit-2026-05-06T14-22-00.md
```

The container ships only the toolchain (Foundry, Bun, Slither) plus an empty `/workspace/` ready for the project. Custom `sandbox_*` tools — `sandbox_read`, `sandbox_write`, `sandbox_ls`, `sandbox_stat`, `sandbox_move`, `sandbox_delete` — wrap StacyVM's HTTP API to reach this filesystem. Path-scoping is enforced per-agent (e.g., the SC agent cannot write outside `/workspace/contracts/`).

The two tool families never collide because the names are deliberately different: built-in `read_file` reads skills; `sandbox_read` reads project files. The system prompt makes this explicit to the LLM.

---

## 5. Skills Catalog

Agents discover skills via filesystem reads using the deepagents built-in tools (`ls`, `read_file`, `glob`, `grep`) over a `FilesystemBackend` rooted at the agent backend's local `agent-ts/skills/` directory — **not** the StacyVM container. The container image stays bare; skills version with the agent code. From the LLM's point of view the skills tree appears mounted at `/`, so calls look like `read_file("/audit-checklist/SKILL.md")`.

The agent decides which to read based on the task at hand. Each SKILL.md file is short (100–250 lines), focused on one capability, and contains an opening summary so the agent can decide whether to load it.

Below is what each skill should cover. **Do not write content yet** — these are specs for what each file should teach an agent.

| Skill | Purpose |
|---|---|
| `solidity-debugging` | How to read `forge test` output, common failure patterns (stack too deep, revert without reason, out-of-gas, division by zero), how to add console.log via forge-std, how to use `--match-test` and `-vvvv` |
| `gas-optimization` | When to optimize, packed structs, calldata vs memory, custom errors over require strings, immutable vs constant, batch operations, storage refs |
| `reentrancy-prevention` | Checks-effects-interactions, ReentrancyGuard usage, when transient storage is appropriate, push vs pull payment patterns |
| `access-control-patterns` | Ownable vs AccessControl vs custom modifiers, two-step ownership transfer, role-based design tradeoffs |
| `storage-layout` | Slot layout rules, upgradeable patterns and storage gaps, reading slots with `forge inspect` and `cast storage` |
| `forge-deployment-troubleshooting` | What to do when deploy fails (.env not sourced, RPC down, gas too low, nonce mismatch), how to read broadcast files, how to recover from partial deploys |
| `abi-extraction` | The `forge build && jq` pattern, dynamic discovery of contract artifact paths, what to do when contract name ≠ file name |
| `foundry-test-patterns` | Setup vs setUp, fuzz testing, invariant testing, fork tests, vm.prank/startPrank/stopPrank, vm.expectRevert |
| `bun-dependency-management` | Why bun over npm/yarn here, how to add/remove deps, lockfile commits, dealing with native module compatibility |
| `react-component-patterns` | Component composition, when to lift state, controlled vs uncontrolled, server vs client components if Next.js |
| `tailwind-design` | Color systems, responsive design, dark mode patterns, when to use @apply vs inline classes |
| `wagmi-hooks-patterns` | useReadContract, useWriteContract, useSimulateContract, useWaitForTransactionReceipt, error handling, loading states |
| `viem-client-config` | Chain config for Sepolia, transport options, account types (privateKey vs JSON-RPC), why viem over ethers |
| `metamask-connection` | injected provider detection, wagmi connectors, handling chain switches, reconnection logic |
| `contract-event-listening` | useWatchContractEvent, polling vs WebSocket, event filtering, debouncing |
| `audit-checklist` | The full checklist the audit agent walks through: external calls, access control, arithmetic, storage, oracles, time/randomness, denial-of-service vectors, front-running |
| `slither-output-interpretation` | What each Slither detector means, false positive patterns, how to silence checks legitimately, severity calibration |

If a future capability needs documenting, the pattern is: create a new skill folder, write its SKILL.md, rebuild image. No code changes required.

---

## 6. AGENTS.md Strategy

AGENTS.md files are project memory, always loaded into the agent's system prompt at startup. Different agents see different AGENTS.md files based on which directories are in their scope.

Three AGENTS.md files exist:

**`/workspace/AGENTS.md`** — Project-wide conventions. Read by every agent that operates in the container. Contains: project's purpose (mirrors PRD summary), naming conventions, branching/commit message conventions, any project-wide constraints (e.g., "Sepolia only", "no upgradeable contracts in v1"). The Orchestrator generates this on kickoff by summarizing the PRD; subsequent agents inherit it.

**`/workspace/contracts/AGENTS.md`** — Contract-specific conventions. Read by Smart Contract agent and Audit agent. Contains: solidity version pinning, OpenZeppelin version, preferred patterns the Orchestrator decided on (e.g., "use Ownable2Step, not Ownable"), test coverage expectations, any contract that's been declared canonical, file naming rules (one contract per file, contract name = file name).

**`/workspace/frontend/AGENTS.md`** — Frontend-specific conventions. Read by Frontend agent and Integration agent. Contains: framework choice (e.g., Vite + React, Next.js), styling approach (Tailwind), state management approach, file structure conventions, the location ABI files should be copied to (`src/abi/`), the location address constants should live (`src/lib/addresses.ts`), wallet connector preferences.

These files are *generated by the Orchestrator on kickoff* by extracting relevant sections from PRD.md. They evolve as the project does — when the Orchestrator makes a decision (e.g., "we're going with Vite, not Next.js"), it appends to the relevant AGENTS.md. Specialists can also append to AGENTS.md when they establish a new convention worth persisting.

---

## 7. Sub-Prompts Library

Each agent has a base system prompt that defines its identity, constraints, and core capabilities. On top of that base, sub-prompts are conditionally appended when specific situations arise. Sub-prompts live in the agent backend code, not in the container, because they're code-side configuration loaded by name.

**File location (in agent backend):** `src/prompts/`

```
src/prompts/
  base/
    planner.txt
    orchestrator.txt
    smart-contract.txt
    frontend.txt
    integration.txt
    audit.txt
  fragments/
    test-debugging.txt           # injected when last action was a failing forge test
    deployment-mode.txt          # injected when about to deploy
    gas-conscious.txt            # injected when user mentions gas concerns
    security-paranoid.txt        # injected when working on access-controlled functions
    ui-creative.txt              # injected for UI design tasks
    ui-precise.txt               # injected for pixel-perfect / accessibility tasks
    fresh-deploy.txt             # injected for first-time deploy of a contract
    redeploy.txt                 # injected when redeploying an existing contract
    integration-check.txt        # injected when verifying ABI ↔ frontend match
    audit-thorough.txt           # injected when audit flag = high
    audit-quick.txt              # injected when audit flag = quick scan
    error-recovery.txt           # injected when last tool call failed
    long-context.txt             # injected when message history > 30k tokens (be terse)
```

The agent's effective system prompt at any moment is `base + selected_fragments + AGENTS.md content + skills the agent has chosen to load`. The orchestrator that builds the system prompt is a simple text concatenator with section headers separating each layer.

**Selection logic** (a small classifier function, NOT an LLM call) examines: the current todo, the last tool result, recent error states, user message keywords. Sub-prompts are selected before each LLM call, not once per run. This is what makes prompts dynamic.

---

## 8. Tool Inventory

All tools are TypeScript functions in the agent backend that wrap StacyVM REST calls. They take a sandbox ID as their first context parameter (injected by the agent runtime, not visible to the LLM) and structured args from the LLM. They return structured results.

### 8.1 Filesystem & Exec Primitives (available to all coding agents)

Two tool families, two filesystems. Names are deliberately different so they never collide with each other or with deepagents' built-ins.

**Sandbox filesystem (the user's project, inside the StacyVM container):**

| Tool | Backed by | Purpose |
|---|---|---|
| `sandbox_read(path)` | StacyVM `GET /sandboxes/{id}/files` | Read a file under `/workspace/` |
| `sandbox_write(path, content)` | StacyVM `POST /sandboxes/{id}/files` | Write/overwrite under `/workspace/` |
| `sandbox_ls(path)` | StacyVM `GET /sandboxes/{id}/files/list` | Directory listing |
| `sandbox_delete(path)` | StacyVM `DELETE /sandboxes/{id}/files` | Remove |
| `sandbox_move(from, to)` | StacyVM `POST /sandboxes/{id}/files/move` | Rename/move |
| `sandbox_stat(path)` | StacyVM `GET /sandboxes/{id}/files/stat` | Stat a file/dir |
| `bash(command, cwd?, env?)` | StacyVM `POST /sandboxes/{id}/exec` | Generic shell |
| `bash_stream(command, cwd?, env?)` | StacyVM `POST /sandboxes/{id}/exec` (NDJSON) | Streaming shell |

**Skills filesystem (read-only, on the agent backend host):**

| Tool | Backed by | Purpose |
|---|---|---|
| `read_file(path)` | deepagents built-in over `FilesystemBackend(agent-ts/skills)` | Read a SKILL.md |
| `ls(path)` | deepagents built-in | List the skills tree |
| `glob(pattern)` | deepagents built-in | Find SKILL.md files |
| `grep(pattern, path)` | deepagents built-in | Search inside skills |
| `write_file` / `edit_file` | deepagents built-in | **Denied via `permissions`** — skills are read-only |

### 8.2 Smart Contract Tools

| Tool | Wraps | Notes |
|---|---|---|
| `forge_build()` | `cd contracts && forge build --silent` | Returns success + warnings |
| `forge_test(matchTest?, verbosity?)` | `cd contracts && forge test [-vvvv] [--match-test X]` | Parses output structurally |
| `forge_fmt()` | `cd contracts && forge fmt` | |
| `forge_snapshot()` | `cd contracts && forge snapshot` | Gas snapshots |
| `forge_inspect_abi(contractName)` | `cd contracts && forge inspect <c> abi` | Alternative to file-based extraction |
| `forge_deploy_sepolia(scriptPath)` | source .env && forge script ... --broadcast | Low-level primitive. Idempotent: skips re-broadcast if a recent broadcast exists within `DEPLOY_IDEMPOTENCY_TTL_MINUTES` (from `.env`, default 10). Pass `force=true` to override. Prefer `deploy_contract` for the standard flow. |
| `deploy_contract(scriptPath, contractName, ...)` | Composite of `forge_deploy_sepolia` + `read_deployed_address` + `extract_abi` | **Standard deploy entrypoint.** Single tool call returning `{ address, addressPath, abiPath, selectors, skipped }`. Replaces the former `sc-deploy` subagent — see §9. |
| `extract_abi(contractFile, contractName)` | `forge build && jq '.abi' out/.../X.json` | Writes to `/workspace/contracts/.deployments/{contractName}.abi.json` |
| `read_deployed_address(contractName, chainId=11155111)` | Reads `broadcast/<script>/<chainId>/run-latest.json`, finds matching contract | Persists to `.deployments/{contractName}.address` |
| `list_contracts()` | Walks `contracts/src/`, parses for `contract X` declarations | |
| `slither_audit(contractFile?)` | `cd contracts && slither <file>` | Returns structured findings |

### 8.3 Frontend Tools

| Tool | Wraps |
|---|---|
| `bun_install()` | `cd frontend && bun install` |
| `bun_run_build()` | `cd frontend && bun run build` |
| `bun_run_lint()` | `cd frontend && bun run lint` |
| `bun_dev_smoke()` | starts `bun dev` in background, fetches localhost:3000 (or configured port), kills, returns whether it served |
| `list_frontend_tree()` | walks `frontend/src/` and returns a structured tree, ignoring node_modules |

> **Port note (Phase 3 amendment):** the dev-base StacyVM image ships a Next.js 16 starter, so `bun_dev_smoke` defaults to port 3000. Earlier drafts of this PRD specified 5173 (Vite default). The tool accepts an optional `port` arg for projects that override. See `agent-ts/changes.md` → "Phase 3 + 4 amendments".

### 8.4 Integration Tools

| Tool | Behavior |
|---|---|
| `sync_abi_to_frontend(contractName)` | Calls `extract_abi`, then copies output to `/workspace/frontend/src/abi/{contractName}.json` |
| `write_contract_address_constants(contractName, address, chainId)` | Updates or creates `/workspace/frontend/src/lib/addresses.ts` with the new mapping |
| `list_broadcasts()` | Lists everything under `contracts/broadcast/` so agent can find available deployments |

### 8.5 Audit-Specific Tools

| Tool | Behavior |
|---|---|
| `slither_audit(contractFile?)` | Same as above but invoked from audit agent |
| `mythril_audit(contractFile)` | Optional, if mythril is in the image |
| `solhint_check(contractFile)` | Linting findings |
| `read_file(path)` | Read-only access for audit |
| `list_dir(path)` | Read-only |
| `glob_files(pattern)` | Read-only |
| `write_audit_report(content)` | Writes to `/workspace/.audit/audit-{ISO_timestamp}.md` — the *only* write tool the audit agent has |

### 8.6 Tool Access Matrix

| Tool category | Planner | Orchestrator | SC | FE | Int | Audit |
|---|---|---|---|---|---|---|
| FS read/list/glob | – | ✓ | ✓ (contracts/) | ✓ (frontend/) | ✓ (contracts/ + frontend/) | ✓ (contracts/ read-only) |
| FS write/delete/move | – | ✓ (limited to AGENTS.md, todos.json) | ✓ (contracts/) | ✓ (frontend/) | ✓ (contracts/ + frontend/, no Solidity sources) | – |
| `bash` generic | – | – | ✓ | ✓ | ✓ | – |
| forge_* | – | – | ✓ (full) | – | ✓ (read-only subset: extract_abi, list_contracts, read_deployed_address, forge_inspect_abi — NO deploy/test/build/fmt/slither) | – (audit uses slither only) |
| bun_* | – | – | – | ✓ | ✓ | – |
| ABI sync tools | – | – | ✓ | – | ✓ | – |
| slither/mythril | – | – | – | – | – | ✓ |
| `write_audit_report` | – | – | – | – | – | ✓ |
| `task` (spawn subagent) | – | ✓ | ✓ | ✓ | ✓ | – |
| `write_todos` | – | ✓ | ✓ (own todos) | ✓ | ✓ | – |

The path-scoping is enforced at the tool implementation level: the SC agent's `sandbox_write` rejects paths outside `/workspace/contracts/`, the FE agent's rejects paths outside `/workspace/frontend/`. The Integration agent has both roots allowed, with Solidity-source discipline enforced at the prompt layer (and by deny-listing the SC-only forge tools that would otherwise mutate contract artifacts). This prevents prompt-injection-driven scope violations from crossing agent boundaries — see `agent-ts/changes.md` → "Phase 3 + 4 amendments" for the integration scope rationale.

---

## 9. Subagent Architecture

Deep Agents supports subagents via the `task` tool. The pattern: parent agent has a list of registered subagents; calling `task({ subagentName, taskDescription, context })` spawns the subagent in an isolated context, runs it to completion, and returns a structured summary. The parent never sees the subagent's intermediate messages — only the final summary.

### 9.1 Smart Contract Subagents

Subagents are reserved for work that genuinely benefits from an isolated LLM context with multi-turn iteration. Mechanical, deterministic operations (compile, deploy, ABI extract) are direct or composite tool calls — see §8.2 — not subagents. Spinning up a fresh LLM for plumbing wastes tokens and multiplies failure modes (recursion limits, JSON-summary parsing, prompt drift) without any decision-making upside.

| Subagent | Tools | Purpose |
|---|---|---|
| `sc-test` | `forge_test`, `sandbox_read`, `sandbox_write`, `forge_build` | Iterate test ↔ fix loop. The LLM reads failing assertions, decides whether to patch contract or test, re-runs. Returns when all tests pass or attempt limit hit. |
| `sc-quick-audit` | `slither_audit`, `sandbox_read`, `list_contracts` | Light Slither pass plus triage of findings (many are false positives) for the SC agent's self-checks. The full audit agent is separate. |

**Removed in this revision:** `sc-compile`, `sc-deploy`, `sc-abi-extract` are no longer subagents — they are direct tool calls (`forge_build`, `deploy_contract`, `extract_abi`) on the parent SC agent. The `deploy_contract` composite tool wraps the deploy/address/ABI sequence with idempotency built in (§8.2).

### 9.2 Frontend Subagents

| Subagent | Tools | Purpose |
|---|---|---|
| `fe-install` | `bun_install`, `read_file` | Resolve dependencies, deal with conflicts. |
| `fe-build-check` | `bun_run_build`, `read_file` | Verify the frontend builds cleanly. |
| `fe-lint-fix` | `bun_run_lint`, `read_file`, `write_file` | Fix lint issues. |
| `fe-component-author` | `read_file`, `write_file`, `list_frontend_tree` | Writes new React components per spec. |
| `fe-dev-smoke` | `bun_dev_smoke` | Boots dev server, hits it, reports if alive. |

### 9.3 Integration Subagents

| Subagent | Tools | Purpose |
|---|---|---|
| `int-abi-sync` | `extract_abi`, `sync_abi_to_frontend`, `list_contracts` | Pulls latest ABI, places in frontend. |
| `int-address-sync` | `read_deployed_address`, `write_contract_address_constants`, `list_broadcasts` | Updates addresses.ts. |
| `int-wagmi-setup` | `read_file`, `write_file`, `list_frontend_tree` | Scaffolds wagmi config, providers, custom hooks. |
| `int-hook-author` | `read_file`, `write_file` | Writes contract interaction hooks per spec. |

### 9.4 Parent → Subagent Context Flow

When a parent calls `task`, it passes:

1. **Task description**: A short paragraph describing the goal (e.g., "Compile the project. If errors, summarize them. Do not attempt to fix.").
2. **Relevant context**: A small bundle of strings. Examples: the path of the file just edited, the contract name being worked on, the failing test name. Never the full message history.
3. **Skills allowlist** (optional): If the subagent should focus on specific skills, pass their names. Otherwise the subagent has access to the full `/skills/` directory just like its parent.
4. **Inherited AGENTS.md**: The subagent loads the same AGENTS.md files relevant to its scope — no need to pass; it reads them.

The subagent runs with its own message history (starting fresh), its own model config (which can differ from the parent — see Model Profiles), and its own todos if it needs to plan. When it completes, it returns a JSON-shaped summary:

```
{
  status: "success" | "failure" | "partial",
  summary: "Compiled successfully. 2 warnings about unused imports in Counter.sol.",
  artifacts: {
    filesChanged: ["contracts/src/Counter.sol"],
    deploymentAddress: "0x...",
    abiPath: "/workspace/contracts/.deployments/Counter.abi.json",
    // task-specific fields
  },
  nextSteps: ["Address unused imports", "Run forge test"]
}
```

The parent sees this summary as a tool result, integrates it into its reasoning, and proceeds. If the parent needs to dig into details, it can ask the subagent's specific tool functions itself (e.g., re-read a file the subagent mentioned).

This isolation has two benefits: the parent's context window stays small (subagent transcripts can be 30k+ tokens), and the parent reasons at a higher level of abstraction.

### 9.5 Sequential vs Parallel Subagent Execution

For v0, **subagent calls are sequential**. The parent calls `task`, waits, gets result, decides next step. This matches the user's stated requirement that orchestration is "sequential and dependency-aware."

Parallel subagent spawning is a future feature, useful for cases like "compile + lint at the same time" where there's no dependency. Worth designing the API to allow it but not implementing for v0.

---

## 10. Model Profile System

Every model invocation in the system is governed by a *profile* — a named bundle of `(model, mode, maxTokens)`. Profiles are defined once and referenced by name from agent configs, subagent configs, and per-call overrides.

**Two lanes, mutually exclusive.** Anthropic's API forbids passing `temperature` (also `top_p`/`top_k`) when extended thinking is enabled. So a profile commits to one or the other:

- **Sampling lane** — custom `temperature`, no thinking. Used for classification, conversational tasks, and creative work where output variation matters.
- **Thinking lane** — extended thinking with a budget, sampling at defaults. Used for code authoring, debugging, deploys, audits — anywhere deliberation beats variation.

The lane is encoded in the profile's `mode` field as a discriminated union, so the model builder can never produce an illegal `(thinking, temperature)` combination at runtime.

### 10.1 Profile Catalog

| Profile | Lane | Model | Temp / Thinking | Use case |
|---|---|---|---|---|
| `cheap` | sampling | `claude-haiku-4-5` | temp 0.0 | Trivial classifications, summarization, mechanical tasks |
| `chat` | sampling | `claude-sonnet-4-6` | temp 0.4 | Planner conversational loop, light Q&A |
| `creative` | sampling | `claude-sonnet-4-6` | temp 0.7 | UI/UX design, component authoring, naming, copy |
| `standard-think` | thinking | `claude-sonnet-4-6` | budget 4k, max 12k | Default for most coding: compile-fix, deploy, integration, mechanical FE work |
| `deep-think` | thinking | `claude-opus-4-7` | budget 8k, max 24k | Hard debugging, complex Solidity authoring, full audit |

Five profiles total. The earlier catalog had ten, but six were sonnet-with-thinking variants whose declared `temperature` had no effect — the API silently ignored it (or, in this codebase, the SDK rejected the call). Five honest profiles is enough.

### 10.2 Default Profile per Agent

| Agent | Default profile |
|---|---|
| Planner | `chat` |
| Orchestrator | `standard-think` |
| Smart Contract | `standard-think` |
| Frontend | `creative` |
| Integration | `standard-think` |
| Audit | `deep-think` |

### 10.3 Per-Subagent Overrides

Subagents inherit the parent's profile by default but can override. Examples:

- `sc-abi-extract` overrides to `cheap` — purely mechanical, haiku is fine.
- `sc-test` overrides to `deep-think` — failing tests often need real reasoning.
- `sc-deploy`, `sc-compile`, `sc-quick-audit` use `standard-think` — deploy and compile checks deliberate but don't need opus.
- `fe-component-author` overrides to `creative` — writing new UI from scratch wants temperature variation.
- `fe-build-check`, `fe-lint-fix` use `standard-think` — mechanical fixes deliberate.

### 10.4 Per-Call Dynamic Selection

Within an agent's run, individual LLM calls can request a different profile via the runtime config. Pattern: a `selectProfile(intent)` function maps intent signals (current todo description, last user message keywords, last-tool-failed flag) to profile names. Examples in the SC agent:

- Default → `standard-think`.
- Last tool failed AND text mentions test/deploy/build with fail/revert/error → `deep-think`.
- Text mentions "test fail" / "revert" / "stack too deep" / "out of gas" / "invariant" → `deep-think`.

For the Frontend agent, "design" / "copy" / "naming" / "component" keywords route to `creative`; everything else (build/lint fixes) routes to `standard-think`.

### 10.5 Cost-Bound Fallback

Every agent run has a token budget. When 80% consumed, profiles downgrade one tier following this chain:

```
deep-think  →  standard-think  →  cheap
creative    →  chat            →  cheap
```

Cross-lane downgrades from creative/chat → cheap are intentional: when running tight, dropping sampling variation for the cheapest model is the right tradeoff. The agent is informed via a system message that it's in cost-saving mode so it can prioritize finishing over exploring.

---

## 11. Memory & Persistence

Three layers, each with a clear scope.

### 11.1 Working Memory (in-run)

Lives in LangGraph state. Holds the current message history, todo list, and any in-flight tool results. Lost when the run ends if not checkpointed.

### 11.2 Thread Memory (cross-run, same conversation)

Postgres-backed via `@langchain/langgraph-checkpoint-postgres`. Each thread is a sequence of runs sharing state. The user can leave and come back; the agent picks up where it left off.

**Schema (managed by the checkpointer):**

```
agent.checkpoints
agent.checkpoint_writes
agent.checkpoint_blobs
```

Plus our own metadata:

```
agent.threads
  id (uuid)
  project_id (uuid)
  agent_type (text: 'planner' | 'orchestrator' | 'smart_contract' | ...)
  created_at, updated_at
  status (text: 'active' | 'idle' | 'archived')
  total_tokens_used (bigint)
  total_runs (int)

agent.runs
  id (uuid)
  thread_id (uuid)
  agent_type (text)
  parent_run_id (uuid, nullable — set when subagent run)
  status, started_at, ended_at
  input_message (text)
  final_summary (jsonb)
  model_profile_used (text)
  tokens_input, tokens_output
  error (text, nullable)

agent.delegations
  id (uuid)
  parent_run_id (uuid)
  child_subagent_name (text)
  task_description (text)
  result (jsonb)
  duration_ms (int)
```

### 11.3 Long-Term Memory (cross-thread, cross-session)

Things the agent should remember across conversations: user preferences ("always use Ownable2Step"), project-level decisions ("we settled on Vite"), patterns the user has rejected ("user dislikes inline styles"). Keyed by `(user_id, project_id, namespace)`.

```
agent.memory
  id (uuid)
  user_id (uuid)
  project_id (uuid, nullable — null for user-wide)
  namespace (text: 'preferences' | 'decisions' | 'patterns_rejected' | ...)
  key (text)
  value (jsonb)
  updated_at
```

Long-term memory is loaded into the agent's system prompt as a small "what we know about this user/project" section at startup. Agents can write to it via a `remember(namespace, key, value)` tool.

### 11.4 Summarization Strategy

When a thread's message history exceeds 30,000 tokens, run a summarization pass before the next LLM call. Uses the `cheap` profile.

**Algorithm:**

1. Take all messages older than the most recent 10.
2. Bucket them into logical chunks (roughly: each user message + the agent's full response to it = one chunk).
3. Send the bucketed history to Haiku with a prompt: "Summarize this conversation history. Preserve: file changes made, deployments completed, decisions reached, errors encountered and resolved. Discard: chain-of-thought, tool result text, transient discussion. Output as a structured outline."
4. Replace the old messages with a single system-role message: `[Earlier conversation summary: ...]`.
5. Persist the summary alongside the checkpoint so it doesn't need re-summarizing.

After summarization, the message history is roughly: `[summary] + [most recent 10 messages]`. The agent loses access to the verbatim earlier conversation but retains the *facts* from it.

This is invoked automatically by a middleware that runs before each LLM call. If history is under threshold, it does nothing. If over, it summarizes and replaces.

### 11.5 Parent → Subagent Memory Flow

Subagents do NOT inherit the parent's message history. They receive only the task description and explicit context bundle. Subagent runs have their own checkpoint chain (with `parent_run_id` set), so they can resume independently if interrupted, but they're isolated.

If a subagent needs information the parent has, the parent must include it in the task description explicitly. This forces the parent to be deliberate about what context is relevant, which keeps subagent runs focused and cheap.

When a subagent completes, only its structured summary is persisted into the parent's run history. The subagent's full transcript stays in its own checkpoint chain for debugging but doesn't pollute the parent's context.

---

## 12. PRD-to-Todos Flow

When the Orchestrator agent first spawns in a fresh container, its kickoff sequence is:

**Step 1: Read PRD.** Reads `/workspace/PRD.md` in full. Reads `/workspace/AGENTS.md` if present (likely empty on first run).

**Step 2: Extract structured plan.** Internal LLM call (using `standard-think`) that converts the PRD into three sections of structured todos:

```
{
  "contracts_phase": [
    { "id": "c1", "title": "Implement Counter contract", "details": "...", "depends_on": [] },
    { "id": "c2", "title": "Write tests for Counter", "details": "...", "depends_on": ["c1"] },
    { "id": "c3", "title": "Deploy Counter to Sepolia", "details": "...", "depends_on": ["c2"] },
    { "id": "c4", "title": "Extract Counter ABI", "details": "...", "depends_on": ["c3"] }
  ],
  "frontend_phase": [
    { "id": "f1", "title": "Set up Vite + React + Tailwind", "details": "...", "depends_on": [] },
    { "id": "f2", "title": "Build Counter UI component", "details": "...", "depends_on": ["f1"] }
  ],
  "integration_phase": [
    { "id": "i1", "title": "Configure wagmi for Sepolia", "details": "...", "depends_on": ["f1"] },
    { "id": "i2", "title": "Wire Counter component to deployed contract", "details": "...", "depends_on": ["c4", "f2", "i1"] }
  ]
}
```

**Step 3: Write AGENTS.md files.** Generate `/workspace/AGENTS.md`, `/workspace/contracts/AGENTS.md`, `/workspace/frontend/AGENTS.md` from the PRD. These bake project conventions into agent-readable form.

**Step 4: Persist todos.** Use `write_todos` to flatten the structured plan into Deep Agents' todo system. Mark contracts_phase items as the active set; mark frontend and integration as deferred.

**Step 5: Begin contracts phase.** Delegate the first contract todo to the Smart Contract agent. Receive its summary. Mark the todo done. Move to the next.

**Step 6: Phase transition.** When all contracts todos are done, mark the contracts phase complete, activate the frontend phase, delegate to Frontend agent. Same for integration.

**Step 7: Enter interactive mode.** When all phases are done, the Orchestrator emits a "PRD execution complete" event and waits for user messages. New messages are routed by intent: contract changes → SC agent, UI changes → FE agent, wiring → Integration agent.

---

## 13. Streaming Strategy

The agent emits a stream of events that the test harness CLI (and later, the agentic server) forwards to the user. Every event has a `type` field and a payload.

**Event types to emit:**

| Event | When | Payload |
|---|---|---|
| `agent_started` | Run begins | `{ agent, threadId, runId }` |
| `thinking_started` | LLM call initiated | `{ profile, modelName }` |
| `thinking_chunk` | Streaming LLM tokens | `{ text }` |
| `thinking_ended` | LLM call done | `{ tokensIn, tokensOut, ms }` |
| `tool_call_started` | A tool is being invoked | `{ tool, args }` |
| `tool_call_ended` | Tool finished | `{ tool, result, ms, ok }` |
| `todo_updated` | Todo list changed | `{ todos }` |
| `subagent_spawned` | `task` tool invoked | `{ parentRunId, subagentName, taskDescription }` |
| `subagent_event` | Pass-through event from subagent | `{ subagentRunId, innerEvent }` |
| `subagent_returned` | Subagent finished | `{ subagentRunId, summary }` |
| `agent_message` | Agent emits a message to user | `{ text }` |
| `error` | Anything threw | `{ where, message, stack? }` |
| `agent_ended` | Run complete | `{ status, finalSummary, totalTokens, ms }` |

The CLI pretty-prints these in a hierarchical way: subagent events are indented, tool calls show their args concisely, thinking is dimmed, errors are red. The same event stream later becomes the SSE feed the frontend consumes.

The Deep Agents SDK already streams via LangGraph's event API. Our wrapper translates LangGraph's native events into this canonical event schema so the rest of the system isn't tied to LangGraph's internal event names.

---

## 14. Test Harness CLI

The user wants to test agents from a terminal before any backend exists. This script is the entrypoint.

**File:** `src/cli/test-harness.ts`

**Behavior:**

```
$ tsx src/cli/test-harness.ts --agent smart-contract --new-sandbox
[harness] Spawning sandbox...
[harness] Sandbox ready: sb-a1b2c3d4
[harness] Loading template image: dev-base-counter
[harness] Restoring starter project to /workspace
[harness] Smart Contract agent ready. Talk to it.
> Write a simple Counter contract with increment, decrement, and reset functions
[agent_started] smart-contract / run-7e8f
[thinking_started] standard-think / claude-sonnet-4-6
[thinking_chunk] I'll create a Counter contract with the three requested functions...
[tool_call_started] write_file { path: "contracts/src/Counter.sol", content: "..." }
[tool_call_ended] write_file ok (87ms)
[subagent_spawned] sc-compile — "Compile and report"
  [thinking_started] standard-think
  [tool_call_started] forge_build
  [tool_call_ended] forge_build ok (1422ms)
  [subagent_returned] sc-compile { status: success, summary: "Build OK, 0 warnings" }
[todo_updated] - [x] Write Counter contract (done)
                - [ ] Add tests for Counter
[agent_message] I've written the Counter contract. It compiles cleanly. Should I write tests next?
[agent_ended] success / 4823 tokens / 6.2s
> yes, write thorough tests
...
```

**Flags:**

```
--agent <smart-contract | frontend | integration | orchestrator | planner | audit>
--sandbox <existing-sandbox-id>     # use this existing sandbox
--new-sandbox                        # spawn fresh
--template <name>                    # which container template (default: dev-base)
--thread <existing-thread-id>        # resume existing thread
--new-thread                         # start fresh thread
--profile <override-profile-name>    # override the agent's default profile
--prd <path>                         # for orchestrator: path to PRD.md to inject
--max-tokens <n>                     # cost limit per run
```

**What the script does internally:**

1. Parses flags.
2. If `--new-sandbox`: POSTs to StacyVM `/api/v1/sandboxes` with template name, gets `sandbox_id`.
3. If `--prd`: writes the PRD content to `/workspace/PRD.md` via StacyVM file API.
4. Connects to Postgres (uses `DATABASE_URL` env). Creates or resumes thread record.
5. Instantiates the requested agent with: sandbox_id (passed as configurable in LangGraph), thread_id, checkpointer pointing at the same Postgres.
6. Enters readline loop. Each user message: invokes `agent.stream({ messages: [...] }, config)`, formats events, prints them.
7. On Ctrl+C: marks thread idle, optionally destroys sandbox if `--new-sandbox` was used.

This is a single TypeScript file, maybe 250 lines, that proves the entire stack end-to-end. It is the testbed for everything before the agentic server is built.

---

## 15. Module Layout

The agent backend, from a code organization standpoint:

```
src/
  agents/
    planner/
      index.ts                # exports createPlannerAgent()
      systemPrompt.ts         # builds the dynamic prompt
      tools.ts                # planner-specific tools (template lookup)
    orchestrator/
      index.ts
      systemPrompt.ts
      kickoff.ts              # PRD-to-todos logic
      delegation.ts           # phase ordering, when to call which specialist
    smartContract/
      index.ts
      systemPrompt.ts
      subagents/
        compile.ts
        test.ts
        deploy.ts
        quickAudit.ts
        abiExtract.ts
    frontend/
      index.ts
      systemPrompt.ts
      subagents/
        install.ts
        buildCheck.ts
        lintFix.ts
        componentAuthor.ts
        devSmoke.ts
    integration/
      index.ts
      systemPrompt.ts
      subagents/
        abiSync.ts
        addressSync.ts
        wagmiSetup.ts
        hookAuthor.ts
    audit/
      index.ts
      systemPrompt.ts
      reportFormatter.ts
  prompts/
    base/
      planner.txt
      orchestrator.txt
      smart-contract.txt
      frontend.txt
      integration.txt
      audit.txt
    fragments/
      [all the .txt files listed in §7]
    composer.ts               # builds final system prompt from base + fragments
    selector.ts               # picks which fragments to include
  tools/
    filesystem.ts             # read_file, write_file, list_dir, etc.
    bash.ts                   # bash, bash_stream
    forge.ts                  # all forge_* tools
    bun.ts                    # all bun_* tools
    abi.ts                    # extract_abi, sync_abi_to_frontend, etc.
    audit.ts                  # slither, mythril, write_audit_report
    pathScope.ts              # scoping wrappers (rejects out-of-scope writes)
    stacyvmClient.ts          # the underlying StacyVM HTTP client
  models/
    profiles.ts               # profile catalog
    selectProfile.ts          # intent-based selection
    anthropicClient.ts        # configured Anthropic SDK client
  memory/
    checkpointer.ts           # PostgresSaver setup
    summarizer.ts             # the summarization middleware
    longTerm.ts               # remember() / recall() helpers
    schema.sql                # all CREATE TABLE statements for the agent.* schema
  streaming/
    events.ts                 # canonical event types
    translator.ts             # LangGraph event → canonical event
  cli/
    test-harness.ts           # the manual testing CLI
  config/
    index.ts                  # env loading, validation
```

Tests in `tests/` mirror this structure. Each subagent gets a unit test (mocking StacyVM responses), each agent gets an integration test (against a real sandbox).

---

## 16. Build Phases

### Phase 0 — Foundation (week 1)
- Skills directory structure and the SKILL.md files (content can be terse for v0)
- StacyVM TypeScript client wrapping the REST API
- Filesystem and bash tool primitives
- Path-scoping wrapper
- Postgres schema and checkpointer setup
- Canonical event types and LangGraph event translator
- The test harness CLI shell (no agents wired yet, just sandbox spawn + interactive loop)

### Phase 1 — Smart Contract Agent (weeks 2–3) — **PRIMARY FOCUS**
- All forge_* tools wired and individually tested via direct CLI calls
- Smart Contract agent base prompt
- Subagents: sc-compile, sc-test, sc-deploy, sc-abi-extract
- End-to-end manual test: ask agent to write Counter, verify it compiles, deploys to Sepolia, persists address, extracts ABI
- This is the gate that proves the entire mechanical stack works. Do not move past this until it does.

### Phase 2 — Audit Agent (week 4)
- slither tool wrapper (assumes slither installed in image; if not, install in dockerfile first)
- Audit agent base prompt and audit-checklist skill
- Report formatter (structured markdown output)
- Manual test: point at a deliberately vulnerable contract, verify report identifies the issues

### Phase 3 — Frontend Agent (week 5)
- bun_* tools
- Frontend agent base prompt
- Subagents: fe-install, fe-build-check, fe-lint-fix, fe-component-author, fe-dev-smoke
- Manual test: ask agent to scaffold a Counter UI, verify it builds, smoke test runs

### Phase 4 — Integration Agent (week 6)
- ABI sync and address constants tools
- Integration agent prompt
- Subagents: int-abi-sync, int-address-sync, int-wagmi-setup, int-hook-author
- Manual test: from a deployed contract + scaffolded frontend, ask Integration to wire them. Verify clicking a button calls the contract.

### Phase 5 — Planner Agent (week 7)
- Standalone, no container
- Iterative conversation loop, structured PRD output
- Manual test: have a real conversation, get a real PRD, manually verify it covers contracts/frontend/integration sections

### Phase 6 — Orchestrator (week 8)
- PRD-to-todos extraction
- AGENTS.md generation
- Sequential delegation logic
- Manual test: feed a PRD, watch it run all three specialists in order, end up with a deployed and integrated app

### Phase 7 — Memory & Polish (week 9)
- Postgres summarization middleware
- Long-term memory tools
- Cost-bound profile downgrading
- Sub-prompt fragments and dynamic selection refined
- Stress test: long conversations, complex PRDs, recovery from interrupted runs

---

## 17. Cost Optimization Patterns

The agent system burns money in three ways: too-large models, too-large contexts, and too-many calls. Each has mitigations baked into the design.

**Model selection.** The default profile for any agent is the cheapest Anthropic model that does the job acceptably. Sonnet covers 80% of tasks. Opus is reserved for: deep audit, hard debugging, complex Solidity authoring. Haiku covers classification, summarization, simple file ops.

**Context summarization.** Triggers automatically at 30k tokens. Replaces old verbatim history with a compressed outline. The summarizer uses Haiku, costing pennies per summarization vs the dollars saved on subsequent Sonnet/Opus calls.

**Subagent isolation.** Subagents don't inherit parent's message history. Their context starts fresh from the task description. This means a long-running Orchestrator session doesn't accumulate cost in subagent calls.

**Skills loaded on demand.** Skills are not in the system prompt. They're read by the agent when it needs them (via filesystem read tool). For 17 skills × ~200 lines each, baking them all into the system prompt would add ~50k tokens to every call. Loading on demand keeps the system prompt small.

**Sub-prompt selection.** The classifier that picks sub-prompts is rule-based (string matching on the current todo, last error, keywords), not an LLM call. Free.

**Token budget per run.** Every run has a hard cap (default 200k tokens for SC agent, 100k for FE/Int, 500k for Audit). When 80% consumed, profiles downgrade. When 100% consumed, the run halts and asks the user to confirm continuation with a new budget.

**Cache file reads.** A simple per-run cache of file contents avoids re-reading the same file multiple times. When a write happens, cache for that path is invalidated.

**Parallel-to-sequential downgrade.** When the budget is tight, optional parallel work (e.g., concurrent test runs) becomes sequential.

---

## 18. Acceptance Criteria for Phase 1

The Smart Contract agent (Phase 1, the priority milestone) is "done" when, from a fresh `tsx src/cli/test-harness.ts --agent smart-contract --new-sandbox` session, the user can:

1. Ask: *"Write a Counter contract with increment, decrement, reset, and a getter for the count. Use OpenZeppelin Ownable so only the owner can reset."*
2. Watch the agent write the contract, run `forge build` (via subagent), and confirm it compiles.
3. Ask: *"Write tests covering all functions including access control on reset."*
4. Watch the agent write a test file, run `forge test` (via subagent), and confirm all pass.
5. Ask: *"Deploy to Sepolia."*
6. Watch the agent run the deploy script with .env sourced, see the broadcast file written, the deployed address persisted to `.deployments/Counter.address`.
7. Ask: *"Extract the ABI."*
8. See the ABI written to `.deployments/Counter.abi.json`.

Every step streams visibly to the terminal: thinking, tool calls, subagent spawns, todo updates. The thread is checkpointed in Postgres. Killing the script and running `tsx src/cli/test-harness.ts --agent smart-contract --sandbox <id> --thread <id>` resumes the conversation cleanly.

If all eight steps pass on a fresh run, Phase 1 is complete and the rest of the build phases are derisked because the mechanical stack is proven.

---

## 19. Open Questions

A few things that aren't critical to start but should be decided as you build.

**Slither in the image, or installed on demand?** Bake it in (faster, no surprises) but Solidity version compatibility might force version pinning in the image too. Settle on a Solidity version range and pin Slither to match.

**Does the Orchestrator pause between phases for user approval?** Currently designed to run all three phases autonomously after PRD kickoff. You may want a "review the contracts before I proceed to frontend?" gate. Easy to add later.

**How does the user switch agents mid-conversation in the CLI?** Slash commands (`/audit`, `/frontend`)? For the CLI test harness, just restart with a different `--agent` flag. For the eventual product, slash commands seem cleaner than UI dropdowns.

**Mythril / Echidna in the audit agent?** Slither covers most cases. Mythril is symbolic execution, useful for deeper analysis but slow. Echidna is fuzz testing, requires writing properties. Start with Slither + manual reasoning; add the others later as opt-in flags.

**What happens when a subagent fails repeatedly?** The parent currently sees a `failure` summary and decides what to do. Consider adding a circuit breaker: if the same subagent fails 3 times on the same task, escalate to the user instead of looping.

**Skills versioning.** When skills evolve, container images need rebuilding. Establish a versioning convention (e.g., image tag = `agent-base:v1.4.2`) and a way for users to opt into updates without disrupting active sessions.

**Wallet keys for deployment.** The test harness assumes `.env` with `RPC_URL` and `PRIVATE_KEY` is provisioned in the container before the SC agent runs. The mechanism for getting those values into `.env` (user-provided in central backend, encrypted, decrypted at sandbox provision time) is the central backend's problem, not the agent's. Just document the contract: "the agent assumes /workspace/contracts/.env exists with RPC_URL and PRIVATE_KEY set."

---

**End of PRD.**
