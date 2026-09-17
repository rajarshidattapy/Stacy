// Builds the final system prompt by concatenating, in order:
//   1. base agent prompt
//   2. selected fragment files
//   3. AGENTS.md content (project + scope-specific)
//   4. long-term memory snippet (if any)
//
// Layered with simple section dividers — no fancy templating. Reads files
// from disk lazily and caches them per-process.
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE_DIR = resolve(HERE, "base");
const FRAGMENTS_DIR = resolve(HERE, "fragments");

const _cache = new Map<string, string>();

async function loadFile(path: string): Promise<string> {
  const cached = _cache.get(path);
  if (cached !== undefined) return cached;
  const content = await readFile(path, "utf8");
  _cache.set(path, content);
  return content;
}

export interface ComposeInput {
  base: string;                // base prompt name, e.g. "smart-contract"
  fragments?: string[];        // fragment names (without .txt)
  agentsMd?: string;           // already-loaded AGENTS.md content
  longTermMemory?: string;     // already-formatted memory snippet
  sandboxId?: string;
}

export async function composePrompt(input: ComposeInput): Promise<string> {
  const sections: string[] = [];

  const base = await loadFile(resolve(BASE_DIR, `${input.base}.txt`));
  sections.push(base.trim());

  for (const name of input.fragments ?? []) {
    const fragPath = resolve(FRAGMENTS_DIR, `${name}.txt`);
    try {
      const content = await loadFile(fragPath);
      sections.push(content.trim());
    } catch {
      // missing fragment is non-fatal — log but don't crash the run.
      console.warn(`[composer] missing fragment: ${name}`);
    }
  }

  if (input.agentsMd && input.agentsMd.trim()) {
    sections.push(`## Project conventions (AGENTS.md)\n\n${input.agentsMd.trim()}`);
  }

  if (input.longTermMemory && input.longTermMemory.trim()) {
    sections.push(`## What we know about this user / project\n\n${input.longTermMemory.trim()}`);
  }

  if (input.sandboxId) {
    sections.push(`## Runtime\n\nSandbox id: ${input.sandboxId}. All tool calls operate on this sandbox's filesystem.`);
  }

  return sections.join("\n\n---\n\n");
}

// For tests: clear the file cache so prompt edits during dev are picked up.
export function _clearPromptCache(): void {
  _cache.clear();
}
