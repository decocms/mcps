import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

// Define recursive CategoryTree schema
const categoryTreeSchema: z.ZodType<{
  id: number;
  name: string;
  hasChildren: boolean;
  url: string;
  children: unknown[];
}> = z.lazy(() =>
  z.object({
    id: z.number(),
    name: z.string(),
    hasChildren: z.boolean(),
    url: z.string(),
    children: z.array(categoryTreeSchema),
  }),
);

const outputSchema = z.array(categoryTreeSchema);

export const listCategories = (env: Env) =>
  createTool({
    id: "VTEX_LIST_CATEGORIES",
    description: "List the category tree up to specified levels deep.",
    inputSchema: z.object({
      levels: z.coerce
        .number()
        .optional()
        .describe("Levels of categories to return (default: 3)"),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.listCategories(context.levels);
      return outputSchema.parse(result);
    },
  });
