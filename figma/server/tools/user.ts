import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { getAccessToken } from "../lib/env.ts";
import { FigmaClient } from "../lib/figma-client.ts";

export const createWhoamiTool = (env: Env) =>
  createPrivateTool({
    id: "figma_whoami",
    description:
      "Get the current authenticated Figma user's ID, handle, email, and profile image URL.",
    inputSchema: z.object({}),
    execute: async () => {
      const client = new FigmaClient(getAccessToken(env));
      return await client.whoami();
    },
  });
