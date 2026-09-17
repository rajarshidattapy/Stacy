import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(__dirname, "../../../../templates");
const PRDS_DIR = resolve(__dirname, "../../../../generated-prds");

function asJson(x: unknown): string {
  return typeof x === "string" ? x : JSON.stringify(x);
}

export function buildAllPlannerTools(): StructuredToolInterface[] {
  return [
    tool(
      async ({ name }) => {
        try {
          const content = await readFile(resolve(TEMPLATES_DIR, `${name}.md`), "utf-8");
          return asJson({ ok: true, data: { content } });
        } catch (error) {
          return asJson({ ok: false, error: `Template not found or error reading: ${String(error)}` });
        }
      },
      {
        name: "lookup_template",
        description: "Reads a project template from the templates directory.",
        schema: z.object({
          name: z.string().describe("Name of the template (e.g. 'simple-erc20')"),
        }),
      }
    ),
    tool(
      async ({ content }) => {
        try {
          await mkdir(PRDS_DIR, { recursive: true });
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const path = resolve(PRDS_DIR, `prd-${timestamp}.md`);
          await writeFile(path, content, "utf-8");
          return asJson({ ok: true, data: { path } });
        } catch (error) {
          return asJson({ ok: false, error: `Error writing PRD: ${String(error)}` });
        }
      },
      {
        name: "save_prd",
        description: "Saves the generated PRD to the disk. Call this only once when the user explicitly approves the PRD.",
        schema: z.object({
          content: z.string().describe("The full markdown content of the PRD"),
        }),
      }
    )
  ];
}
