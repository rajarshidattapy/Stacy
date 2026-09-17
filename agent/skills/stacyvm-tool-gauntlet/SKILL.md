---
name: stacyvm-tool-gauntlet
description: Use when the user asks to stress test, validate, benchmark, or exercise many StacyVM tools in one agent run.
---

# StacyVM Tool Gauntlet

Use the high-level `tool_gauntlet` tool first. It safely exercises identity, list, stat, write, read, move, chmod, glob, grep, exec, preview URL, and cleanup using only temporary files under `/workspace/app/.agent-test-*`.

## Required behavior

1. Confirm sandbox identity with `whoami`.
2. Run `tool_gauntlet` with `include_build=false` for fast tests.
3. Run `tool_gauntlet` with `include_build=true` only when the user wants a heavier stress test.
4. Never call `sandbox_destroy`.
5. Never delete anything outside `/workspace/app/.agent-test-*`.
6. Never glob `node_modules`, `.next`, or `.git`.
7. Return a PASS/FAIL summary table with evidence.

## Final report

Include:

- sandbox ID
- tools exercised
- failed tools
- command exit codes
- build result if included
- cleanup result
- risks or suspicious behavior
