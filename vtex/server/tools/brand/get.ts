import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const getBrand = (env: Env) =>
  createTool({
    id: "VTEX_GET_BRAND",
    description: "Get brand details by ID.",
    inputSchema: z.object({
      brandId: z.number().describe("The brand ID"),
    }),
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      return client.getBrand(context.brandId);
    },
  });
