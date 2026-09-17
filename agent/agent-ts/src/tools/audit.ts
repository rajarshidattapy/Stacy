// Audit-agent–specific tool primitives.
//
// `slitherAudit` lives in `forge.ts` (it predates Phase 2 and is also used
// by the SC `sc-quick-audit` subagent). We re-export it here so audit code
// imports from a single, semantically-named module.
//
// `writeAuditReport` is the **only** write tool the audit agent has. It
// writes to `/workspace/.audit/audit-<ISO>-<slug>.md` — outside of
// `/workspace/contracts/` so it can never overwrite user source code.
//
// `solhintCheck` is optional per PRD §2.1: if `solhint` isn't on PATH the
// tool returns a structured error (code = "SOLHINT_UNAVAILABLE") rather than
// throwing, so the LLM treats it as a recoverable signal and moves on.
import { bash } from "./bash.ts";
import { writeFile } from "./filesystem.ts";
import { ok, err, type Result } from "./result.ts";

export { slitherAudit, type SlitherFinding } from "./forge.ts";

const AUDIT_DIR = "/workspace/.audit";

// ── write_audit_report ──────────────────────────────────────────────────────
export interface WriteAuditReportArgs {
  /** Markdown content of the report. */
  content: string;
  /** Optional URL-safe slug appended to the filename. */
  slug?: string;
}

export interface WriteAuditReportResult {
  path: string;
  bytes: number;
}

export async function writeAuditReport(
  sandboxId: string,
  args: WriteAuditReportArgs,
): Promise<Result<WriteAuditReportResult>> {
  const slug = sanitizeSlug(args.slug ?? "report");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${AUDIT_DIR}/audit-${stamp}-${slug}.md`;

  const mk = await bash(sandboxId, `mkdir -p ${AUDIT_DIR}`);
  if (!mk.ok) return err(`could not create ${AUDIT_DIR}: ${mk.error}`, "AUDIT_DIR_FAILED");

  const w = await writeFile(sandboxId, { path, content: args.content });
  if (!w.ok) return w;

  return ok({ path, bytes: args.content.length });
}

// ── solhint_check (optional) ────────────────────────────────────────────────
export interface SolhintFinding {
  severity: "error" | "warning" | "info";
  rule: string;
  message: string;
  file: string;
  line?: number;
  column?: number;
}

export interface SolhintCheckArgs {
  /** Glob like 'src/**\/*.sol'. Defaults to 'src/**\/*.sol'. */
  pattern?: string;
}

export async function solhintCheck(
  sandboxId: string,
  args: SolhintCheckArgs = {},
): Promise<Result<{ findings: SolhintFinding[]; raw: string }>> {
  // 1. Probe for the binary so we can return a structured "not available"
  //    instead of letting the LLM see a generic shell error.
  const probe = await bash(sandboxId, "command -v solhint || true");
  if (!probe.ok) return probe;
  if (!probe.data.stdout.trim()) {
    return err("solhint not installed in this sandbox", "SOLHINT_UNAVAILABLE");
  }

  const pattern = args.pattern ?? "src/**/*.sol";
  // solhint exits 1 when it finds violations; that is success for us.
  const r = await bash(sandboxId, `solhint ${shellQuote(pattern)} --formatter json || true`, {
    cwd: "/workspace/contracts",
    timeout: "1m",
  });
  if (!r.ok) return r;
  const { stdout, stderr } = r.data;

  if (!stdout.trim()) {
    return ok({ findings: [], raw: stderr.slice(-1000) });
  }

  let parsed: Array<{
    severity?: number;
    ruleId?: string;
    message?: string;
    filePath?: string;
    line?: number;
    column?: number;
  }>;
  try {
    parsed = JSON.parse(stdout);
  } catch (e) {
    return err(`solhint output unparseable: ${(e as Error).message}`, "SOLHINT_PARSE_FAILED");
  }

  const findings: SolhintFinding[] = parsed.map((p) => ({
    severity: p.severity === 2 ? "error" : p.severity === 1 ? "warning" : "info",
    rule: p.ruleId ?? "(unknown)",
    message: p.message ?? "",
    file: p.filePath ?? "",
    line: p.line,
    column: p.column,
  }));

  return ok({ findings, raw: stderr.slice(-1000) });
}

// ── helpers ─────────────────────────────────────────────────────────────────
function sanitizeSlug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "report"
  );
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
