import { buildModel } from "../../models/anthropicClient.ts";
import { writeFile } from "../../tools/filesystem.ts";

export async function generateAgentsMdFiles(
  sandboxId: string,
  prdContent: string
): Promise<{ [path: string]: string }> {
  // Use a cheap profile for this mechanical extraction
  const model = buildModel("cheap");

  const prompts = [
    {
      path: "/workspace/AGENTS.md",
      system:
        "Extract project-wide conventions from the PRD. " +
        "Include project purpose, naming conventions, branching/commit conventions, " +
        "and project-wide constraints.",
    },
    {
      path: "/workspace/contracts/AGENTS.md",
      system:
        "Extract contract-specific conventions from the PRD. " +
        "Include solidity version, preferred patterns, test expectations, and file naming rules.",
    },
    {
      path: "/workspace/frontend/AGENTS.md",
      system:
        "Extract frontend-specific conventions from the PRD. " +
        "Include framework choice, styling approach, state management, ABI copy location, " +
        "address constants location, and wallet connector preferences.",
    },
  ];

  const results: { [path: string]: string } = {};

  await Promise.all(
    prompts.map(async (p) => {
      const res = await model.invoke([
        { role: "system", content: p.system },
        { role: "user", content: prdContent },
      ]);
      const content = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
      
      const writeRes = await writeFile(sandboxId, { path: p.path, content });
      if (!writeRes.ok) {
        console.warn(`[orchestrator] failed to write ${p.path}: ${writeRes.error}`);
      } else {
        results[p.path] = content;
      }
    })
  );

  return results;
}
