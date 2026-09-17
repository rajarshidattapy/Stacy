// Shared `FilesystemBackend` for the deepagents built-in tools (`ls`,
// `read_file`, `write_file`, `edit_file`, `glob`, `grep`).
//
// The built-in tools navigate a *different* filesystem from the StacyVM
// sandbox: they read the **agent backend host's** disk, specifically the
// versioned `agent-ts/skills/` directory that ships with the agent code.
// Custom `sandbox_*` tools handle the user's project inside the container.
//
// Skills live with the agent code (not in the container image) so the image
// stays bare, skill updates ride along with code deploys, and a future job-
// based worker spawning many sandboxes only needs one place to update skills.
//
// Permissions deny writes/edits — skills are read-only from the LLM.
import { FilesystemBackend } from "deepagents";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// agent-ts/src/agents/_runtime/  →  agent-ts/skills/
export const SKILLS_DIR = resolve(HERE, "../../../skills");

export function buildSkillsBackend(): () => FilesystemBackend {
  return () => new FilesystemBackend({ rootDir: SKILLS_DIR, virtualMode: true });
}

export const READ_ONLY_SKILLS_PERMISSIONS = [
  { operations: ["write"] as const, paths: ["/**"], mode: "deny" as const },
];
