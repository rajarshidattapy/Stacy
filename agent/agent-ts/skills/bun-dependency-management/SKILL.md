---
name: bun-dependency-management
description: How to manage frontend dependencies with bun — install, add, remove, lockfile handling, native module fallbacks. Use when modifying package.json or troubleshooting install failures in /workspace/frontend/.
---

# bun-dependency-management

## When to use

Any change to dependencies in `/workspace/frontend/`. Diagnosing `bun install` failures. Choosing whether to use bun or fall back to npm for native modules.

## Why bun

- Native TypeScript execution (no separate transpile).
- Faster install than npm/yarn (often 5-10x).
- npm-compatible: reads `package.json`, resolves the npm registry by default.
- Built-in test runner, dev server, bundler.

## Daily commands

```bash
cd /workspace/frontend

bun install                   # install all deps from package.json
bun add wagmi                 # add a runtime dep
bun add -d @types/node        # add a dev dep
bun add -d -E typescript      # exact version (no ^/~)
bun remove wagmi              # uninstall
bun update wagmi              # update one dep
bun update                    # update all (respecting semver ranges)
bun pm ls                     # list installed
bun pm ls --all               # full tree
```

## Run scripts

```bash
bun run dev          # runs the "dev" script from package.json
bun run build        # build script
bun run lint
bun dev              # bun also runs scripts directly without "run"
```

## Lockfile

`bun.lockb` is a binary lockfile. Commit it. Treat as the source of truth for versions.

```bash
bun install --frozen-lockfile     # CI mode — fail if lockfile would change
```

To inspect or convert:

```bash
bun pm ls > deps.txt              # human-readable snapshot
```

If diff is needed in PRs, some teams also commit `bun.lockb.json` (textual export) — bun doesn't ship this natively; use a script.

## Adding common web3 deps

```bash
bun add wagmi viem @tanstack/react-query
bun add -d @types/react @types/node
```

`@tanstack/react-query` is required by wagmi v2 — install both.

## Native module compatibility

Some packages (e.g., `bcrypt`, certain `node-gyp` builds, older sqlite drivers) ship native bindings that bun's installer occasionally misbuilds. Symptoms: `dlopen` errors, missing `.node` files, segfaults at import.

Fallback recipe:

```bash
# Use npm for the problem package, bun for everything else
npm install bcrypt --no-save        # builds the native binding
bun add bcrypt                      # records in bun.lockb without rebuilding
```

Or, in `package.json`, add the package then prefer npm for that one install:

```bash
rm -rf node_modules
npm install                          # full npm install, rebuilds natives
```

The agent system runs in a Linux container — most native modules build fine.

## Version pinning

Default `bun add` writes `^1.2.3` (caret — minor updates allowed). For stability:

```bash
bun add -E react@18.3.1     # exact pin
```

For major libraries that affect bundle output (react, wagmi, viem), pin exact during dev to avoid drift.

## Engine constraints

In `package.json`:

```json
{
  "engines": {
    "node": ">=20",
    "bun": ">=1.1"
  }
}
```

`bun install` warns on mismatch but doesn't refuse. CI should enforce explicitly.

## Workspaces (monorepo)

If `/workspace/frontend/` is part of a workspace:

```json
// root package.json
{
  "workspaces": ["frontend", "shared"]
}
```

```bash
bun install                          # installs all workspaces
bun add --filter frontend wagmi      # add to one
```

For v0, single-workspace frontend. No need for multi-workspace setup.

## Script PATH

`bun run` adds `node_modules/.bin` to PATH automatically. Inside a script:

```json
{ "scripts": { "build": "vite build && tsc --noEmit" } }
```

## Diagnosing install failures

```bash
bun install --verbose           # full output
bun pm cache rm                 # clear bun's cache if a corrupted download
rm -rf node_modules bun.lockb && bun install   # nuclear
```

Network failures (rate limits): set `BUN_CONFIG_REGISTRY_TIMEOUT` or use a private registry mirror.

## Common mistakes

- **Mixing npm and bun in the same checkout** — produces conflicting lockfiles (`package-lock.json` AND `bun.lockb`). Pick one. Delete the other.
- **Not committing `bun.lockb`** — every install resolves fresh, builds drift across machines.
- **Using `npm install` "to be safe"** — overwrites `bun.lockb` semantics. If the project uses bun, stick with bun.
- **`bun add` in the wrong directory** — adds to whichever `package.json` is in cwd. Always `cd /workspace/frontend/` first.
- **Assuming bun is identical to node** — `bun:test`, `bun:fs` differ from node. For deps that must run in node too, test there.
- **Not using `--frozen-lockfile` in CI** — silent dependency upgrades sneak in via PRs.
