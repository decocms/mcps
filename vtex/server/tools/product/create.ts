import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient, getCredentials } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const createProduct = (env: Env) =>
  createTool({
    id: "VTEX_CREATE_PRODUCT",
    description: "Create a new product in the catalog.",
    inputSchema: z.object({
      Name: z.string().describe("Product name"),
      CategoryId: z.number().describe("Category ID"),
      BrandId: z.number().describe("Brand ID"),
      LinkId: z.string().describe("URL slug for the product"),
      RefId: z.string().optional().describe("Reference ID"),
      IsVisible: z.boolean().optional().describe("Whether product is visible"),
      Description: z.string().optional().describe("Product description"),
      IsActive: z.boolean().optional().describe("Whether product is active"),
      Title: z.string().optional().describe("Page title for SEO"),
      MetaTagDescription: z
        .string()
        .optional()
        .describe("Meta description for SEO"),
    }),
    execute: async ({ context }) => {
      const client = new VTEXClient(getCredentials(env));
      return client.createProduct(context);
    },
  });
