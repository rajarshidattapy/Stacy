---
name: pnpm-workflow
description: pnpm-driven Next.js workflow inside the EVM sandbox. Use when installing deps, running dev/build, or troubleshooting pnpm-lock.yaml. Never use npm or yarn — they will desync the lockfile.
---

# pnpm-workflow

## When to use

Anything in `/workspace/frontend`. The frontend is pnpm-only.

## Tool preference

Always prefer the typed tools over raw shell:

| Goal              | Tool              | Raw shell fallback              |
|-------------------|-------------------|---------------------------------|
| Install deps      | `pnpm_install`    | `cd /workspace/frontend && pnpm install` |
| Production build  | `pnpm_run_build`  | `pnpm run build`                |
| Lint              | `pnpm_run_lint`   | `pnpm run lint`                 |
| Dev smoke test    | `pnpm_dev_smoke`  | `pnpm dev -- -H 0.0.0.0 -p 3000`|

## When to install

Run `pnpm_install` only when:

- `package.json` changed (new dep, version bump).
- `pnpm-lock.yaml` changed.
- A fresh sandbox where deps weren't pre-installed.

Otherwise the existing `node_modules` from the Docker image is what you want. Re-installing wastes minutes and sometimes destabilizes the build.

## Adding a dependency

```
pnpm add <pkg>            # production
pnpm add -D <pkg>         # devDependency
```

Lockfile must be committed alongside. If `pnpm-lock.yaml` is dirty after the install, it's not a bug — commit it.

## Dev server

`pnpm_dev_smoke(port=3000)` will:

1. Try `curl http://127.0.0.1:3000` first (reuse a running server).
2. If no response, start `pnpm dev -- -H 0.0.0.0 -p 3000` in background, wait, retry curl.
3. Report status, head of HTML body, and a preview URL via `sandbox.get_preview_url(3000)`.

Don't manually `pnpm dev &` from raw shell unless `pnpm_dev_smoke` is unavailable; it duplicates background processes.

## Build verification

`pnpm_run_build` runs `next build` which:

- Type-checks (TypeScript errors fail the build).
- Lints (ESLint).
- Compiles all routes.
- Generates `.next/` output.

If it fails, the error tail is in `stderr_tail`. Common patterns:

- `Type error: ...` → fix the types; don't add `// @ts-ignore`.
- `Cannot find module '@/...'` → tsconfig path alias missing or wrong root.
- `Module not found: pino-pretty` → wagmi optional dep; ignore unless blocker.

## Don't do this

- ❌ `npm install` — desyncs the lockfile.
- ❌ `yarn install` — same.
- ❌ Delete `pnpm-lock.yaml` "to refresh deps" — that loses pinned versions.
- ❌ Run `pnpm install --frozen-lockfile=false` to bypass a mismatch — fix the mismatch instead.
- ❌ Hand-edit `node_modules/...` — gone on the next install.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `ERR_PNPM_LOCKFILE_BREAKING_CHANGE` | Lockfile from a different pnpm major | `pnpm install` to migrate |
| `Cannot find module 'next'` | node_modules missing | `pnpm install` |
| Build hangs forever | Tailwind v4 watcher loop on a symlink | `rm -rf .next && pnpm run build` |
| Port 3000 busy | Old dev server still alive | `pkill -f 'next dev'` then `pnpm_dev_smoke` |
