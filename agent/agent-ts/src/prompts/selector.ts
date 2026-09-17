// Picks which fragment files to append to a base prompt. Pure rules — no LLM.
//
// Examines:
//   - currentTodo (string match for "test", "deploy", etc.)
//   - lastToolStatus (failure → error-recovery)
//   - lastToolName + result (e.g., forge_test fail → test-debugging)
//   - lastUserMessage (keyword match)
//   - flags from caller (e.g., circuitOpen, freshDeploy)

export interface SelectorInput {
  agent: string;
  currentTodo?: string;
  lastUserMessage?: string;
  lastToolName?: string;
  lastToolFailed?: boolean;
  lastToolResult?: unknown;
  circuitOpen?: boolean;
  // Smart-contract-specific flags
  freshDeploy?: boolean;
  redeploy?: boolean;
  // Frontend-specific flags (set by createFrontendAgent based on sandbox state)
  freshFrontend?: boolean;
  // Integration-specific flags (set by createIntegrationAgent)
  noDeployments?: boolean;
  abiMismatch?: boolean;
}

export function selectFragments(input: SelectorInput): string[] {
  const text = `${input.currentTodo ?? ""} ${input.lastUserMessage ?? ""}`.toLowerCase();
  const fragments: string[] = [];

  // ── Universal: circuit breaker + generic recovery ───────────────────────
  if (input.circuitOpen) {
    fragments.push("circuit-breaker-tripped");
  }

  if (input.lastToolFailed) {
    fragments.push("error-recovery");
  }

  // ── Smart-contract-specific signals ─────────────────────────────────────
  if (input.lastToolName === "forge_test") {
    const result = input.lastToolResult as { success?: boolean; failed?: number } | undefined;
    if (result && (result.success === false || (result.failed ?? 0) > 0)) {
      fragments.push("test-debugging");
    }
  }

  if (input.agent === "smart-contract") {
    if (/\bdeploy\b/.test(text) || input.lastToolName === "forge_deploy_sepolia") {
      fragments.push("deployment-mode");
      if (input.freshDeploy) fragments.push("fresh-deploy");
      if (input.redeploy) fragments.push("redeploy");
    }
  }

  // ── Frontend-specific signals ───────────────────────────────────────────
  if (input.agent === "frontend") {
    if (input.freshFrontend) fragments.push("frontend-fresh-start");
    if (input.lastToolName === "bun_run_build") {
      const r = input.lastToolResult as { success?: boolean } | undefined;
      if (input.lastToolFailed || r?.success === false) fragments.push("frontend-build-failed");
    }
    if (input.lastToolName === "bun_run_lint") {
      const r = input.lastToolResult as { success?: boolean; issues?: unknown[] } | undefined;
      if (r && (r.success === false || (r.issues?.length ?? 0) > 0)) {
        fragments.push("frontend-lint-failed");
      }
    }
  }

  // ── Integration-specific signals ────────────────────────────────────────
  if (input.agent === "integration") {
    if (input.noDeployments) fragments.push("integration-no-deployments");
    if (input.abiMismatch) fragments.push("integration-abi-mismatch");
  }

  return dedupe(fragments);
}

function dedupe(xs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}
