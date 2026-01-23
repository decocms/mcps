import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient, getCredentials } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const getBrand = (env: Env) =>
  createTool({
    id: "VTEX_GET_BRAND",
    description: "Get brand details by ID.",
    inputSchema: z.object({
      brandId: z.number().describe("The brand ID"),
    }),
    execute: async ({ context }) => {
      const client = new VTEXClient(getCredentials(env));
      return client.getBrand(context.brandId);
    },
  });
