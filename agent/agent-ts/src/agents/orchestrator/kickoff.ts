import { z } from "zod";
import { buildModel } from "../../models/client.ts";
import { selectProfile } from "../../models/selectProfile.ts";

export const TodoSchema = z.object({
  id: z.string(),
  title: z.string(),
  details: z.string(),
  dependsOn: z.array(z.string()),
});

export const PhasedPlanSchema = z.object({
  contractsPhase: z.array(TodoSchema),
  frontendPhase: z.array(TodoSchema),
  integrationPhase: z.array(TodoSchema),
});

export type PhasedPlan = z.infer<typeof PhasedPlanSchema>;
export type Todo = z.infer<typeof TodoSchema>;

export async function parsePrdToTodos(prdContent: string): Promise<PhasedPlan> {
  // We must use a sampling profile ("chat" or "cheap") because Anthropic
  // forbids forced tool calling (which withStructuredOutput uses) when
  // extended thinking is enabled. Sampling profiles are non-reasoning models
  // on OpenAI too.
  const profileName = "chat";
  const model = buildModel(profileName);

  const modelWithStructure = model.withStructuredOutput(PhasedPlanSchema);

  const result = await modelWithStructure.invoke([
    {
      role: "system",
      content:
        "You are an orchestrator. Parse the given PRD into a phased plan of concrete implementation tasks.\n" +
        "Output three phases: contractsPhase, frontendPhase, and integrationPhase.\n" +
        "Each task must have an id, title, details, and dependsOn (array of task ids it depends on).",
    },
    { role: "user", content: prdContent },
  ]);

  return result as PhasedPlan;
}
