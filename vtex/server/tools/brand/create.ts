import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

const outputSchema = z.object({
  id: z.number(),
  name: z.string(),
  isActive: z.boolean(),
  title: z.string().nullable(),
  metaTagDescription: z.string().nullable(),
  imageUrl: z.string().nullable(),
});

export const createBrand = (env: Env) =>
  createTool({
    id: "VTEX_CREATE_BRAND",
    description: "Create a new brand.",
    inputSchema: z.object({
      Name: z.string().describe("Brand name"),
      Text: z.string().optional().describe("Brand description"),
      Keywords: z.string().optional().describe("Keywords for search"),
      SiteTitle: z.string().optional().describe("Title for SEO"),
      Active: z.coerce.boolean().optional().describe("Whether brand is active"),
      MenuHome: z.coerce.boolean().optional().describe("Show in home menu"),
    }),
    outputSchema,
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      const result = await client.createBrand(context);
      return outputSchema.parse(result);
    },
  });
