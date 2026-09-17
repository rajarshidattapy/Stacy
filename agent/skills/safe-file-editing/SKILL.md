---
name: safe-file-editing
description: Use when creating, editing, overwriting, moving, or deleting files inside StacyVM.
---

# Safe File Editing

## File read rules

- Use `read_file` for source code because it gives line numbers and pagination.
- Use `sandbox_read_file` for whole small files or config files.
- Do not read huge generated directories.

## File write rules

- Use `write_file` only for brand-new files.
- Use `edit_file` for targeted changes.
- Use `overwrite_file` only for full replacement of an existing file.
- Use `apply_unified_patch` for multi-file diffs.

## Delete rules

- Delete only temporary files unless the user explicitly asks.
- For stress tests, only delete `/workspace/app/.agent-test-*`.
- Never call `sandbox_destroy` unless the user explicitly requests sandbox destruction.
