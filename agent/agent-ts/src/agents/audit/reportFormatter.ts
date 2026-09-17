// Deterministic markdown formatter for audit reports.
//
// The Audit agent writes the markdown directly inside its `write_audit_report`
// call — the LLM is the source of truth for finding text and reasoning.
// This formatter is a parallel implementation used by tests and by any
// future post-run normalization (e.g., regenerating a report from a JSON
// findings store). Keeping it deterministic here means tests can assert
// exact markdown without invoking an LLM.

export type Severity = "critical" | "high" | "medium" | "low" | "informational";

export interface Finding {
  id: string;                  // e.g. "AUDIT-001"
  title: string;
  severity: Severity;
  file: string;                // e.g. "src/Bank.sol"
  line?: number;
  description: string;
  recommendation: string;
  tool: "slither" | "manual";
  swcId?: string;              // e.g. "SWC-107"
}

export interface AuditMetadata {
  project: string;
  contractsAnalyzed: string[];
  slitherVersion?: string;
  durationMs?: number;
  generatedAt: string;        // ISO timestamp
  categoriesCovered?: string[];
  limitations?: string[];
}

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "informational"];

const RISK_VERDICTS: Record<Severity, string> = {
  critical: "Critical issues found. **Do not deploy.**",
  high: "High-severity issues found. Remediate before deployment.",
  medium: "Medium-severity issues found. Address before mainnet.",
  low: "Only low-severity / informational issues found.",
  informational: "No security issues found; informational notes only.",
};

export function formatAuditReport(findings: Finding[], metadata: AuditMetadata): string {
  const sorted = [...findings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  const counts = severityCounts(sorted);
  const verdict = pickVerdict(counts);

  const sections: string[] = [];
  sections.push(`# Audit Report — ${metadata.project}`);
  sections.push(`_Generated ${metadata.generatedAt}_`);
  sections.push(renderExecutiveSummary(counts, verdict, sorted.length));
  sections.push(renderFindingsTable(sorted));
  sections.push(renderDetailedAnalysis(sorted));
  sections.push(renderMethodology(metadata));
  sections.push(renderToolsUsed(metadata));
  sections.push(renderLimitations(metadata));

  return sections.join("\n\n");
}

// ── sections ────────────────────────────────────────────────────────────────

function renderExecutiveSummary(
  counts: Record<Severity, number>,
  verdict: string,
  total: number,
): string {
  const lines: string[] = ["## Executive Summary", ""];
  if (total === 0) {
    lines.push("No findings.");
  } else {
    const parts = SEVERITY_ORDER
      .map((s) => `${counts[s]} ${s}`)
      .filter((p) => !p.startsWith("0 "));
    lines.push(`${total} finding${total === 1 ? "" : "s"}: ${parts.join(", ")}.`);
  }
  lines.push("");
  lines.push(verdict);
  return lines.join("\n");
}

function renderFindingsTable(findings: Finding[]): string {
  const lines: string[] = ["## Findings by Severity", ""];
  if (findings.length === 0) {
    lines.push("_None._");
    return lines.join("\n");
  }
  lines.push("| ID | Severity | Title | Location |");
  lines.push("|---|---|---|---|");
  for (const f of findings) {
    const loc = f.line !== undefined ? `${f.file}:${f.line}` : f.file;
    lines.push(`| ${f.id} | ${cap(f.severity)} | ${escapePipes(f.title)} | \`${loc}\` |`);
  }
  return lines.join("\n");
}

function renderDetailedAnalysis(findings: Finding[]): string {
  const lines: string[] = ["## Detailed Analysis"];
  if (findings.length === 0) {
    lines.push("", "_None._");
    return lines.join("\n");
  }
  for (const f of findings) {
    lines.push("");
    lines.push(`### ${f.id} — ${f.title}`);
    lines.push("");
    lines.push(`- **Severity:** ${cap(f.severity)}`);
    lines.push(`- **Location:** \`${f.line !== undefined ? `${f.file}:${f.line}` : f.file}\``);
    lines.push(`- **Tool:** ${f.tool}`);
    if (f.swcId) lines.push(`- **SWC:** ${f.swcId}`);
    lines.push("");
    lines.push("**Description**");
    lines.push("");
    lines.push(f.description.trim());
    lines.push("");
    lines.push("**Recommendation**");
    lines.push("");
    lines.push(f.recommendation.trim());
  }
  return lines.join("\n");
}

function renderMethodology(metadata: AuditMetadata): string {
  const lines: string[] = ["## Methodology", ""];
  lines.push("**Contracts analyzed:**");
  if (metadata.contractsAnalyzed.length === 0) {
    lines.push("- _none_");
  } else {
    for (const c of metadata.contractsAnalyzed) lines.push(`- \`${c}\``);
  }
  if (metadata.categoriesCovered && metadata.categoriesCovered.length > 0) {
    lines.push("");
    lines.push("**Review categories covered:**");
    for (const c of metadata.categoriesCovered) lines.push(`- ${c}`);
  }
  if (metadata.durationMs !== undefined) {
    lines.push("");
    lines.push(`**Duration:** ${(metadata.durationMs / 1000).toFixed(1)}s`);
  }
  return lines.join("\n");
}

function renderToolsUsed(metadata: AuditMetadata): string {
  const lines: string[] = ["## Tools Used", ""];
  lines.push("- **Audit Agent** — manual review against the audit checklist.");
  if (metadata.slitherVersion) {
    lines.push(`- **Slither** ${metadata.slitherVersion} — static analysis.`);
  } else {
    lines.push("- **Slither** — static analysis.");
  }
  return lines.join("\n");
}

function renderLimitations(metadata: AuditMetadata): string {
  const lines: string[] = ["## Limitations", ""];
  const defaults = [
    "Off-chain components (frontend, indexers, oracles' off-chain computation) were not reviewed.",
    "Economic and game-theoretic attacks beyond what is visible from source were not modeled.",
    "Cross-protocol composability with external contracts not present in `/workspace/contracts/` was not assessed.",
  ];
  const items = [...defaults, ...(metadata.limitations ?? [])];
  for (const i of items) lines.push(`- ${i}`);
  return lines.join("\n");
}

// ── helpers ─────────────────────────────────────────────────────────────────

function severityCounts(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    informational: 0,
  };
  for (const f of findings) counts[f.severity]++;
  return counts;
}

function pickVerdict(counts: Record<Severity, number>): string {
  for (const s of SEVERITY_ORDER) {
    if (counts[s] > 0) return RISK_VERDICTS[s];
  }
  return RISK_VERDICTS.informational;
}

function severityRank(s: Severity): number {
  return SEVERITY_ORDER.indexOf(s);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function escapePipes(s: string): string {
  return s.replace(/\|/g, "\\|");
}
