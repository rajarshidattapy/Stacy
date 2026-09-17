---
name: tailwind-v4-ui
description: Use when building or editing Next.js UI with Tailwind v4 classes.
---

# Tailwind v4 UI Skill

## Rules

- Use utility classes directly in TSX.
- Avoid assuming `tailwind.config.js`; Tailwind v4 is CSS-driven.
- Keep components responsive by default.
- Prefer semantic HTML and accessible controls.
- Avoid adding new UI libraries unless the user asks.

## Verification

After UI changes:

1. Run `run_build`.
2. Run `run_dev_smoke_test` when runtime verification is needed.
3. Summarize changed files and visible UI behavior.
