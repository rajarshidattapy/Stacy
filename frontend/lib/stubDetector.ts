/**
 * Stub detector for Soroban smart contract code.
 * Rejects placeholder logic, TODOs, and dummy implementations.
 */

export const STUB_RETRY_MESSAGE =
  "REJECTED: Your previous response contained forbidden placeholder code. You MUST rewrite with REAL working storage logic. Use env.storage().persistent().get() and env.storage().persistent().set() for ALL data operations. NO comments, NO TODOs, NO placeholder return values. Provide COMPLETE, PRODUCTION-READY code only.";

/** 
 * Forbidden patterns that indicate placeholder/stub code.
 * User-specified list: "implement", "TODO", "return symbol_short", "//"
 * Note: "//" check is strict - any comment line is flagged as placeholder.
 */
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp | string; description: string }> = [
  // User-specified patterns (exact matches)
  { pattern: /\bimplement\b/i, description: "implement" },
  { pattern: /\bTODO\b/i, description: "TODO" },
  { pattern: /\bFIXME\b/i, description: "FIXME" },
  { pattern: /return\s+symbol_short\b/i, description: "return symbol_short" },
  { pattern: /\/\//, description: "//" },
  
  // Additional placeholder patterns
  { pattern: /\bimplement\s+here\b/i, description: "implement here" },
  { pattern: /\.\.\.\s*(binding|logic|here)/i, description: "placeholder ..." },
  { pattern: /unimplemented!\s*\(\s*\)/i, description: "unimplemented!()" },
  { pattern: /todo!\s*\(\s*\)/i, description: "todo!()" },
  { pattern: /panic!\s*\(\s*["'].*placeholder/i, description: "panic with placeholder" },
  { pattern: /\badd\s+your\s+(logic|code|implementation)\b/i, description: "add your logic" },
  { pattern: /\bstub\b/i, description: "stub" },
  { pattern: /\bplaceholder\b/i, description: "placeholder" },
  { pattern: /\bnothing\s+here\b/i, description: "nothing here" },
  { pattern: /\breturn\s+0\s*;?\s*$/, description: "return 0 placeholder" },
  { pattern: /\breturn\s+\(\s*\)\s*;?\s*$/, description: "return () placeholder" },
];

/**
 * Check if content contains forbidden stub/placeholder patterns.
 * Used for .rs and Soroban contract code.
 */
export function containsStubCode(content: string): { detected: boolean; matched?: string } {
  if (!content || typeof content !== "string") {
    return { detected: false };
  }

  const normalized = content;
  for (const { pattern, description } of FORBIDDEN_PATTERNS) {
    const found =
      typeof pattern === "string"
        ? normalized.includes(pattern)
        : pattern.test(normalized);
    if (found) {
      return { detected: true, matched: description };
    }
  }
  return { detected: false };
}

/**
 * Check if a file path is a Soroban contract file (we run stub detection on these).
 */
export function isContractFile(path: string): boolean {
  if (!path) return false;
  const lower = path.toLowerCase();
  return lower.endsWith(".rs") || lower.endsWith("cargo.toml");
}

/**
 * Run stub detection on editor changes.
 * Returns { stubDetected: boolean, matchedIn?: { path: string; matched: string }[] }.
 */
export function detectStubInChanges(
  changes: Array<{ path: string; action: string; content?: string }>
): { stubDetected: boolean; matchedIn: { path: string; matched: string }[] } {
  const matchedIn: { path: string; matched: string }[] = [];

  for (const ch of changes) {
    if (ch.action === "delete" || !ch.content) continue;
    if (!isContractFile(ch.path)) continue;

    const result = containsStubCode(ch.content);
    if (result.detected && result.matched) {
      matchedIn.push({ path: ch.path, matched: result.matched });
    }
  }

  return {
    stubDetected: matchedIn.length > 0,
    matchedIn,
  };
}
