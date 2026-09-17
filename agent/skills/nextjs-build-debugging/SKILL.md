---
name: nextjs-build-debugging
description: Use when pnpm build, Next.js, React, TypeScript, Tailwind, or runtime smoke checks fail.
---

# Next.js Build Debugging

Use this workflow for build/test/dev-server failures.

## Workflow

1. Read `/workspace/package.json`.
2. Run `run_build` instead of raw shell.
3. Inspect exact stderr/stdout tail.
4. Read only the files named in the error.
5. Fix the smallest possible issue.
6. Run `run_build` again.
7. If UI/runtime behavior matters, run `run_dev_smoke_test`.

## Rules

- Do not rewrite the whole app for a small syntax/import error.
- Prefer targeted `edit_file` for small fixes.
- Prefer `overwrite_file` only when replacing a whole file is safer.
- Never claim success unless the final build or smoke test passed.
