// LangChain `tool(...)` wrappers for the Audit agent.
//
// Audit's tool surface is intentionally narrow:
//   - read-only sandbox FS (`sandbox_read`, `sandbox_ls`, `sandbox_stat`)
//   - `slither_audit` static analysis
//   - `write_audit_report` — the ONLY write tool
//
// Notably absent: `sandbox_write`, `sandbox_delete`, `sandbox_move`, `bash`,
// every `forge_*` except `slither_audit`. Audit must not be able to compile,
// deploy, or modify user code — it identifies issues only.
import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { buildReadOnlySandboxFsTools } from "../_runtime/sandboxFsTools.ts";
import { slitherAudit, writeAuditReport } from "../../tools/audit.ts";

function asJson(x: unknown): string {
  return typeof x === "string" ? x : JSON.stringify(x);
}

export function buildAllAuditTools(sandboxId: string): StructuredToolInterface[] {
  return [
    ...buildReadOnlySandboxFsTools(sandboxId, { roots: ["/workspace/contracts"] }),

    tool(async (args) => asJson(await slitherAudit(sandboxId, args)), {
      name: "slither_audit",
      description:
        "Run Slither static analysis. Pass `contractFile` to target one file " +
        "(relative to /workspace/contracts/, e.g. 'src/Bank.sol'); omit it to " +
        "scan the whole project. Returns parsed findings: " +
        "{ findings: [{ severity, title, description, location }], raw }.",
      schema: z.object({
        contractFile: z.string().optional().describe(
          "Specific contract file (relative to contracts dir) or omit for whole project",
        ),
      }),
    }),

    tool(async (args) => asJson(await writeAuditReport(sandboxId, args)), {
      name: "write_audit_report",
      description:
        "Write the final markdown audit report to /workspace/.audit/. " +
        "Call this exactly once, at the very end of the audit, with the " +
        "complete report content. Returns { ok, data: { path, bytes } }.",
      schema: z.object({
        content: z.string().describe("Full markdown report body"),
        slug: z
          .string()
          .optional()
          .describe(
            "URL-safe slug appended to the filename (e.g. 'bank-sol' or 'project-name'). " +
              "Lowercased; non-alphanumerics collapsed to '-'.",
          ),
      }),
    }),
  ];
}
