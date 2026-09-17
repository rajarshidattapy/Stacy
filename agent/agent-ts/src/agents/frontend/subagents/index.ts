// Subagent registry for the Frontend agent. Five specialists per PRD §9.2.
import { feInstall } from "./install.ts";
import { feBuildCheck } from "./buildCheck.ts";
import { feLintFix } from "./lintFix.ts";
import { feComponentAuthor } from "./componentAuthor.ts";
import { feDevSmoke } from "./devSmoke.ts";
import type { SubagentSpec } from "../../_runtime/types.ts";

export const FE_SUBAGENTS: Record<string, SubagentSpec> = {
  [feInstall.name]: feInstall,
  [feBuildCheck.name]: feBuildCheck,
  [feLintFix.name]: feLintFix,
  [feComponentAuthor.name]: feComponentAuthor,
  [feDevSmoke.name]: feDevSmoke,
};

export { feInstall, feBuildCheck, feLintFix, feComponentAuthor, feDevSmoke };
