import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const listBrands = (env: Env) =>
  createTool({
    id: "VTEX_LIST_BRANDS",
    description: "List all brands in the catalog.",
    inputSchema: z.object({}),
    outputSchema: z
      .object({
        brands: z.array(
          z
            .object({
              id: z.number().describe("Brand ID"),
              name: z.string().describe("Brand name"),
              isActive: z.boolean().describe("Whether brand is active"),
              title: z.string().nullable().describe("Brand page title"),
              metaTagDescription: z
                .string()
                .nullable()
                .describe("Meta tag description"),
              imageUrl: z.string().nullable().describe("Brand logo URL"),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
    execute: async () => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const brands = await client.listBrands();
      return { brands };
    },
  });
