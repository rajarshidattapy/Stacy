// File-backed memory store with dual-cap truncation.
// Spec: harness-docs/Chapter 12: Memory and Cost.md
import { readFileSync, writeFileSync, existsSync } from "fs";

const MAX_LINES = 200;
const MAX_BYTES = 25_000;

function truncate(raw: string): string {
  const lines = raw.trim().split("\n");
  let result = lines.length > MAX_LINES ? lines.slice(0, MAX_LINES).join("\n") : raw.trim();
  if (Buffer.byteLength(result, "utf8") > MAX_BYTES) {
    const cut = result.lastIndexOf("\n", MAX_BYTES);
    result = result.slice(0, cut > 0 ? cut : MAX_BYTES);
  }
  return result;
}

export type MemoryType = "user" | "feedback" | "project" | "reference";

export class MemoryStore {
  constructor(private readonly path: string) {}

  load(): string {
    if (!existsSync(this.path)) return "";
    return truncate(readFileSync(this.path, "utf8"));
  }

  append(type: MemoryType, content: string): string {
    const current = this.load();
    const line = `[${type}] ${content.slice(0, 150)}`;
    const updated = current ? `${current}\n${line}` : line;
    const result = truncate(updated);
    writeFileSync(this.path, result, "utf8");
    return result;
  }

  search(query: string): string[] {
    const content = this.load();
    if (!content) return [];
    const q = query.toLowerCase();
    return content.split("\n").filter((l) => l.toLowerCase().includes(q));
  }
}
