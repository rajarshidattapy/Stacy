# Plan — Fix the Skills + Tools Architecture [IMPLEMENTED — VERIFIED]

## Context

The CLI crashed at agent startup with:

```
ConfigurationError: Tool name(s) [read_file, write_file] conflict with built-in tools.
```

Underneath that surface error are two architectural mistakes that have to be untangled together:

1. **Two filesystems collapsed onto one tool namespace.** Deepagents auto-registers built-in tools (`ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep`, `execute`) that operate on a configurable `backend`. Our custom StacyVM-backed sandbox tools were *also* named `read_file` / `write_file` — verified at [src/agents/smartContract/tools.ts:31-44](agent-ts/src/agents/smartContract/tools.ts#L31-L44) and [node_modules/deepagents/dist/index.js:6959-7010](agent-ts/node_modules/deepagents/dist/index.js#L6959). Hence the collision.

2. **Skills are nowhere wired in.** Per the PRD, the agent should be able to discover skills via `/skills/`. In reality:
   - There are *two* diverged skill directories on disk: `skills/` at the repo root (11 product-shaped skills like nextjs-16-providers, pnpm-workflow) and `agent-ts/skills/` (17 skills matching the PRD §5 catalog).
   - The StacyVM image does **not** bake skills in — verified at [stacyvm/images/evm/Dockerfile](stacyvm/images/evm/Dockerfile) (no COPY of `/skills/`).
   - No code in `agent-ts/src/` ever loads a skill. The composer at [src/prompts/composer.ts](agent-ts/src/prompts/composer.ts) only reads `base/*.txt` and `fragments/*.txt`. The PRD's claim that "agents discover skills via filesystem reads (Deep Agents `FilesystemBackend` pointed at `/skills`)" was never implemented and is also internally inconsistent — `FilesystemBackend` runs in the agent process and reads the host's disk, not the StacyVM container's disk.

The user's stated constraints:

- Don't bloat the StacyVM image. Skills shouldn't have to be in the image.
- A future job-based agent spawning system means agents will run in a worker process separate from the user's container.

## Diagnosis

There are two filesystems the agent has to talk to, and they want different tools:

| Filesystem | Where it lives | Lifetime | Mutability | Right tool |
|---|---|---|---|---|
| **Skill docs** (`audit-checklist/SKILL.md` etc.) | Agent backend host (deployed with code) | Versioned with agent code | Read-only from the LLM's perspective | Deepagents built-ins (`ls`, `read_file`, `glob`, `grep`) over a `FilesystemBackend` |
| **User project** (`/workspace/contracts/Counter.sol`, `.env`, broadcast files…) | Per-job StacyVM container | Per-job | Read-write | Custom HTTP-backed tools (`sandbox_read`, `sandbox_write`, `bash`, `forge_*` …) |

Conflating them under `read_file` / `write_file` was the mistake. Two filesystems should mean two tool surfaces, named differently.

## Architecture

**Skills live with the agent code, not in the container image.**

- Single canonical location: `agent-ts/skills/` (the directory matching the PRD §5 catalog). The diverged root-level `skills/` is a separate concern — leave it alone for now and decide later whether to merge.
- Skills travel with the agent backend at deploy time. When the worker process runs, the skills directory is sitting next to its code on disk.
- For the future job-based spawning system: each worker imports `agent-ts/`, gets `agent-ts/skills/` for free, and provisions a bare StacyVM sandbox per job. Updating a skill = redeploy the worker; never touches the container image. No skew.
- Container image stays bare — Foundry + Bun toolchains + `/workspace/`. No `/skills/`.

**Two distinct tool surfaces, named to make the distinction obvious.**

- **Built-in deepagents tools (`ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep`)** → backed by `FilesystemBackend({ rootDir: <agent-ts/skills>, virtualMode: true })`. Configure `permissions` to make this read-only — the LLM should never write into the skills tree. The agent navigates with `ls("/")`, `read_file("/audit-checklist/SKILL.md")`, `glob("/**/SKILL.md")`.
- **Custom StacyVM-backed tools, renamed with a `sandbox_` prefix** → operate on the user's `/workspace/`. Path-scoping (e.g., `/workspace/contracts/`) stays exactly where it is at [src/tools/pathScope.ts](agent-ts/src/tools/pathScope.ts).

Renames:

| Old | New |
|---|---|
| `read_file` | `sandbox_read` |
| `write_file` | `sandbox_write` |
| `list_dir` | `sandbox_ls` |
| `delete_file` | `sandbox_delete` |
| `move_file` | `sandbox_move` |
| `stat_file` | `sandbox_stat` |
| `bash` | unchanged (no collision; deepagents has `execute`, not `bash`) |
| `forge_*`, `slither_audit`, `extract_abi`, `read_deployed_address`, `list_contracts` | unchanged |

System prompt grows by one short section explaining the split: "Use `read_file` / `ls` / `glob` for skills under `/`. Use `sandbox_*` and `bash` for the user's project under `/workspace/`."

**Skills loaded on demand, not in the system prompt.** Per PRD §17 cost-control rationale, do *not* pass deepagents' `skills` array option (which would auto-inject content). Let the LLM use `ls` and `read_file` to load only what it needs for the current task.

## Files to change

1. **[agent-ts/src/agents/smartContract/tools.ts](agent-ts/src/agents/smartContract/tools.ts)** — rename the six FS tool entries in `buildFsTools` to the `sandbox_*` names. Update tool descriptions to say "operates on the user's project under `/workspace/contracts/`". `buildBashTool` and `buildForgeTools` unchanged.

2. **[agent-ts/src/agents/smartContract/index.ts](agent-ts/src/agents/smartContract/index.ts)** — pass `backend` and `permissions` to `createDeepAgent`:

   ```ts
   import { FilesystemBackend } from "deepagents";
   import { resolve, dirname } from "node:path";
   import { fileURLToPath } from "node:url";

   const SKILLS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../skills");

   const agent = createDeepAgent({
     model,
     tools,
     systemPrompt,
     backend: () => new FilesystemBackend({ rootDir: SKILLS_DIR, virtualMode: true }),
     permissions: [
       { tool: "write_file", path: "/**", action: "deny" },
       { tool: "edit_file",  path: "/**", action: "deny" },
       // ls/read_file/glob/grep default-allow within virtualMode
     ],
     checkpointer: checkpointer as any,
   });
   ```

   Verify the exact `permissions` shape against `node_modules/deepagents/dist/index.d.ts:3083` before merging — adjust property names if the SDK uses something other than `{ tool, path, action }`.

3. **[agent-ts/src/agents/smartContract/subagents/*.ts](agent-ts/src/agents/smartContract/subagents/)** — update each subagent's `buildTools` filter so the `read_file` allowlist entries become `sandbox_read` (and any `write_file` → `sandbox_write`). Subagents that currently filter by the old names will silently end up with empty tool lists otherwise.

4. **[agent-ts/src/agents/_runtime/subagentRunner.ts](agent-ts/src/agents/_runtime/subagentRunner.ts)** — when each subagent's `createDeepAgent` is invoked, pass the *same* `backend` + `permissions` (extract a small `buildSkillsBackend()` helper to share between parent and subagents). Otherwise subagents will fall back to `StateBackend` and the builtin `read_file` will look at empty in-memory state instead of the skills directory.

5. **[agent-ts/src/prompts/base/smart-contract.txt](agent-ts/src/prompts/base/smart-contract.txt)** — append a "Tool surfaces" section that documents the split:
   - "Your `read_file`, `ls`, `glob`, `grep` tools navigate the skills library at `/`. Use them to look up patterns (e.g., `read_file('/forge-deployment-troubleshooting/SKILL.md')`)."
   - "Your `sandbox_*` tools, `bash`, and `forge_*` tools operate on the user's project (under `/workspace/contracts/` for this agent)."

6. **[agent-ts/AGENT_SYSTEM_PRD.md](agent-ts/AGENT_SYSTEM_PRD.md)** — three small corrections:
   - §4 Container Filesystem Layout: remove `/skills/` from the container layout. Move it into a new "Agent backend layout" note.
   - §5 Skills Catalog: clarify "Deep Agents `FilesystemBackend` pointed at the agent backend's local `skills/` directory (not at the container)."
   - §8.1 Filesystem & Exec Primitives: rename the rows to `sandbox_*`, note that the deepagents built-in `read_file` / `write_file` / `ls` / `glob` / `grep` are the skill-FS tools.

7. **No change to [stacyvm/images/evm/Dockerfile](stacyvm/images/evm/Dockerfile).** The image is already free of `/skills/`, which is what we want.

## Out of scope (for this fix)

- The diverged root-level `skills/` directory. Distinct from `agent-ts/skills/` and shaped differently — separate decision.
- Implementing a `StacyvmBackend` that conforms to deepagents' backend protocol so a single `read_file` could route to either filesystem via `CompositeBackend`. More elegant in the long run but doubles the engineering scope and isn't needed to unblock Phase 1. Revisit after the Phase-1 acceptance gate is green.
- Skills versioning / image-tag coupling (PRD §19 open question). Becomes moot once skills no longer live in the image.

## Implementation Status

All code changes are complete as of this session. Confirmed in place:
- `src/agents/smartContract/tools.ts` — `sandbox_read`/`sandbox_write`/`sandbox_ls`/etc. ✅
- `src/agents/_runtime/skillsBackend.ts` — `buildSkillsBackend()` + `READ_ONLY_SKILLS_PERMISSIONS` ✅
- `src/agents/smartContract/index.ts` — `backend: buildSkillsBackend()`, `permissions` wired ✅
- `src/agents/_runtime/subagentRunner.ts` — same backend/permissions for subagents ✅
- `src/models/profiles.ts` + `anthropicClient.ts` — two-lane profile system ✅
- `src/cli/runAgent.ts` — split into `openAgentRun`/`runAgentTurn`/`closeAgentRun` ✅
- `src/cli/test-harness.ts` — `openAgentRun` called first so runs UUID exists before `buildAgent` ✅

## Verification (next steps)

1. `bun run harness --agent smart-contract --new-sandbox --new-thread` starts without `TOOL_NAME_COLLISION` error.
2. Send: `ls the skills directory` — expect agent calls `ls("/")` and lists 17 skill folders from `agent-ts/skills/`.
3. Send: `read the audit-checklist skill` — expect `read_file("/audit-checklist/SKILL.md")`.
4. Send: `write and deploy a counter contract` — expect delegation to `sc-compile` → `sc-test` → `sc-deploy` without FK violation.
5. Full Phase-1 §18 walkthrough: write Counter → tests pass → deploy to Sepolia → extract ABI.
















Summary
Both failures share one root cause: a schema mismatch between stacyvm's FileInfo TypeScript type (declares name) and what the sandbox actually returns over the wire (no name — only path).

Bug: agent-ts/src/tools/forge.ts:149 read e.name, getting undefined for every entry under broadcast/. So read_deployed_address always returned NOT_FOUND even when the broadcast file existed and contained the contract.

Cascading effect on delegation: the sc-deploy subagent's prompt requires it to call read_deployed_address after a successful deploy. The tool kept lying with NOT_FOUND, so the LLM kept poking around — re-deploying, re-listing, re-reading — and blew through its 16-step recursion budget (maxLLMCalls=8 at deploy.ts:27, doubled at subagentRunner.ts:155).

Fix: derive the directory name from entry.path's basename instead of the missing entry.name. One-line change in forge.ts. Typecheck passes; rerun your harness command and the deploy → address-persistence → ABI flow should complete in a single sc-deploy delegation.

A side note worth tracking: the stacyvm SDK's FileInfo.name is structurally lying about the wire payload. Worth either patching the SDK (server should emit name) or removing name from the type so this class of bug surfaces at compile time.





What was changed and why
Fix A — Recursion formula (subagentRunner.ts:155)
Changed * 2 → * 3. deepagents always injects todoListMiddleware, which adds write_todos tool calls as separate graph nodes on top of the standard model+tools pair. * 2 systematically under-counted, causing the recursion limit to fire on the happy path for any task with ~5+ steps. For sc-deploy with maxLLMCalls=8: 16 → 24 nodes.

Fix B — State recovery on throw (subagentRunner.ts:153–202)
Replaced invoke() with stream({ streamMode: "values" }), collecting the latest messages state after each node. If the graph throws a recursion-limit error, the last collected state already contains the final AI message — the runner extracts it and tries parseSummary. If a valid JSON block is found, the delegation is marked success instead of failure. No MemorySaver needed.

Fix C — Idempotent deploy (forge.ts:190–236)
Before broadcasting, forgeDeploySepolia now:

Reads DEPLOY_IDEMPOTENCY_TTL_MINUTES from the sandbox .env (default 10 if not set)
Checks the broadcast file mtime for the same (scriptBasename, SEPOLIA_CHAIN_ID) pair
If the broadcast exists and is younger than the TTL, returns { success: true, skipped: true } without re-broadcasting
Pass force: true to override. The Zod schema in tools.ts:97 exposes this so the LLM can use it deliberately.

SDK fix — FileInfo.name removed (stacyvm/sdk/js/src/types.ts:139 + dist/types.d.ts:114)
The Go server never emits a name field — only path. Removed name: string from both the source type and the compiled declaration so any future caller trying entry.name gets a compile error instead of a silent undefined.




All eight items done. Summary of what changed:

Architecture restructure (the real fix)

New composite tool deploy_contract chains deploy → address-lookup → ABI-extract idempotently in one tool call. No LLM in the loop.
Three subagents deleted: sc-deploy, sc-compile, sc-abi-extract. Their work is now direct tool calls.
Subagent registry agent-ts/src/agents/smartContract/subagents/index.ts now contains only sc-test and sc-quick-audit — the cases where LLM iteration earns its cost.
Bug fixes

The crash: subagentRunner.ts:170 now awaits the stream before iterating. ReactAgent.stream returns a Promise; iterating on it directly threw "undefined is not a function."
Added failureKind: "operation" | "orchestration" to SubagentSummary so the parent can tell "the work failed" from "the runner crashed before knowing."
The runner now tags every orchestration-side failure (recursion limit, parse failure, runtime throw) with failureKind: "orchestration".
Prompt (smart-contract.txt)

Added a "Deploys: always use deploy_contract" rule pointing to the composite tool.
Added an explicit section on orchestration vs operation failures: "Never blindly retry on orchestration failure — verify on-chain/on-disk state first."
PRD (AGENT_SYSTEM_PRD.md)

§8.2 documents deploy_contract and clarifies forge_deploy_sepolia as a low-level escape hatch.
§9.1 explains the rationale: subagents only when LLM reasoning adds value; mechanical work stays as direct/composite tools.
What's not addressed and why

Output interleaving (#5): a CLI rendering issue, separate from orchestration. Diagnosable in test-harness.ts when you want it.
Multi-worker race conditions (#4): TTL guard is the v0 floor. Real concurrency safety needs a sandbox-side lock file or DB-tracked deploy intent — out of scope until the agentic server lands.
Broadcast-trust (#8): we currently treat broadcast file presence as success. Tightening would mean parsing tx receipts. Worth a follow-up but doesn't block Phase 1.
Next step: rerun the harness — bun run harness --agent smart-contract --new-sandbox --new-thread — and walk Phase 1's eight steps. The deploy should be one deploy_contract call now



However, a few minor issues still remain. The build pipeline still emits the forge-std git revision warning, suggesting dependency metadata handling is incomplete. The deploy tool also exposes a very large raw deployment payload (deployRaw) directly in the tool response, which may unnecessarily bloat orchestration context windows over time. Additionally, while deployment is now effectively atomic from the orchestration perspective, there is still no visible confirmation that transaction receipts are independently verified beyond Foundry broadcast artifacts. Overall though, the critical architectural flaw — irreversible blockchain side effects occurring before workflow completion semantics stabilized — appears to be fixed.

---

## Phase 3 + 4 amendments (Frontend Agent, Integration Agent) [IMPLEMENTED]

Two PRD amendments adopted while implementing Phases 3 and 4. Both are baked into the code; this section documents the why so a fresh agent picking up the codebase doesn't roll them back.

## Amendment 1 — `bun_dev_smoke` defaults to port 3000 (not 5173)

**Original PRD §8.3** specified `bun_dev_smoke` polls `localhost:5173` (the Vite default). The actual StacyVM dev-base image ships a **Next.js 16 starter** at `/workspace/frontend/`, not Vite — verified in [stacyvm/images/evm/Dockerfile](stacyvm/images/evm/Dockerfile) (`bun install` is run against a Next.js `package.json` with `react@19`, `next@16.2.4`, `tailwindcss@4`, `wagmi@3.6.9`, `viem@2.x`, `@tanstack/react-query@5`, and the MetaMask connector).

Next.js's dev server binds to port **3000**, not 5173.

**Fix in code:** [agent-ts/src/tools/bun.ts](agent-ts/src/tools/bun.ts) — `bunDevSmoke`'s `port` arg defaults to `3000`. The LLM can override per call via the `port` schema field if a project ever uses something else. The PRD §8.3 row was updated inline to `localhost:3000 (or configured port)` to reflect reality.

**Why not switch the starter to Vite?** Next.js 16 is what the user has been pre-installing. Forcing Vite would mean a new dev-base image and rebuilding `bun.lock`. The mismatch was a PRD oversight, not a deliberate design choice — easier to fix the PRD.

## Amendment 2 — Integration agent has full R/W on both `/workspace/contracts/` and `/workspace/frontend/`

**Original PRD §4.4 + §8.6** described Integration's contract scope as "read access to `/workspace/contracts/abi files and broadcast/`" — i.e., read-only on contracts, write only into `/workspace/frontend/`.

**Why broadened:** the integration tool primitives genuinely write under `/workspace/contracts/`:

- `extractAbi` writes to `/workspace/contracts/.deployments/<n>.abi.json` (this is how the SC agent caches ABIs too).
- `readDeployedAddress` writes to `/workspace/contracts/.deployments/<n>.address`.
- `syncAbiToFrontend` calls `extractAbi` internally → also writes the contracts cache.

If Integration's `sandbox_*` tools were scoped to `/workspace/frontend/` only, the LLM would still have working tools (extract_abi, read_deployed_address don't go through `sandbox_write`), but it'd be confusing — "I can extract an ABI but I can't `sandbox_read` the file I just wrote." Cleaner to allow R/W on both, with a strong prompt rule that **Solidity sources are off-limits** ("if a contract interface is wrong for the UI, surface to the user — the SC agent owns the fix").

**Fix in code:**

- [agent-ts/src/agents/integration/tools.ts](agent-ts/src/agents/integration/tools.ts) — `buildFsToolsForIntegration` calls `buildSandboxFsTools(sandboxId, { roots: [CONTRACTS_ROOT, FRONTEND_ROOT] })`. The forge tool subset exposed to integration deliberately **excludes** `forge_deploy_sepolia`, `forge_test`, `forge_build`, `forge_fmt`, `slither_audit` — only `extract_abi`, `list_contracts`, `read_deployed_address`, `forge_inspect_abi` are allowed. Integration cannot deploy, test, or build contracts.
- [agent-ts/src/prompts/base/integration.txt](agent-ts/src/prompts/base/integration.txt) — explicit "you do not modify Solidity sources or redeploy contracts" rule, plus the hand-off rule that ABI/signature mismatches go to the user, not get patched silently.

**Audit agent unchanged.** The Audit agent retains its strict read-only stance on `/workspace/contracts/` ([agent-ts/src/agents/audit/tools.ts](agent-ts/src/agents/audit/tools.ts) uses `buildReadOnlySandboxFsTools`). Only Integration is broadened.

**PRD §4.4 / §8.6 updated** inline to mark Integration's scope as R/W on both directories with the discipline rule documented.

## Phase 3 + 4 file inventory

Created (24 files):

- `src/tools/bun.ts` — 5 primitives (`bunInstall`, `bunRunBuild`, `bunRunLint`, `bunDevSmoke`, `listFrontendTree`)
- `src/tools/integration.ts` — 3 primitives (`syncAbiToFrontend`, `writeContractAddressConstants`, `listBroadcasts`)
- `src/agents/_runtime/sandboxBashTool.ts` — shared parameterized `buildBashTool({ defaultCwd, scopeHint })`
- `src/agents/frontend/{index,tools}.ts` + `subagents/{index,install,buildCheck,lintFix,componentAuthor,devSmoke}.ts` (5 subagents)
- `src/agents/integration/{index,tools}.ts` + `subagents/{index,abiSync,addressSync,wagmiSetup,hookAuthor}.ts` (4 subagents)
- `src/prompts/base/{frontend,integration}.txt`
- `src/prompts/fragments/{frontend-build-failed,frontend-lint-failed,frontend-fresh-start,integration-no-deployments,integration-abi-mismatch}.txt`

Modified:

- `src/agents/smartContract/tools.ts` — `buildBashTool` now delegates to the shared `_runtime/sandboxBashTool.ts` helper (parameterized cwd). SC behavior unchanged (still passes `/workspace/contracts`).
- `src/cli/test-harness.ts` — added `frontend` and `integration` dispatch branches alongside SC and Audit.
- `src/prompts/selector.ts` — added `frontend` case (build-failed / lint-failed / fresh-start) and `integration` case (no-deployments / abi-mismatch). Existing SC fragment selection is now gated behind `agent === "smart-contract"` so it doesn't leak into other agents.
- `src/models/selectProfile.ts` — explicit `case "integration": return "standard-think"` (was falling through to fallback).

Verification: `bun run typecheck` clean.




 I have successfully added the requested tools (apply_patch, sandbox_read_lines,
  and sandbox_grep) to @agent-ts/src/agents/_runtime/sandboxSystemTools.ts.

  Here is a summary of the new tools:
   1. apply_patch: Uses the native sandbox.writeFile() and sandbox.exec() methods
      to safely apply a unified diff patch inside the sandbox using git apply.
      This tool is very useful for multi-file edits or applying complex code
      refactors without risking indentation errors with basic line-by-line
      replacements.
   2. sandbox_read_lines: Added a native integration with sandbox.readFile() that
      accurately slices the file based on a start_line and end_line constraint
      (1-indexed) to preserve context while reducing prompt token consumption.
   3. sandbox_grep: Uses the sandbox exec command to perform pattern matching
      with grep, optionally scoped by a glob_pattern.

  All the changes pass the typescript type checker and won't conflict with any of
  the deleted/commented-out commands previously removed from the array!