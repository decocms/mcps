import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "../types/env.ts";
import { GaClient } from "../lib/ga-client.ts";

export const listGoogleAdsLinksTool = (env: Env) =>
  createPrivateTool({
    id: "list-google-ads-links",
    description: "Returns a list of links to Google Ads accounts for a property.",
    inputSchema: z.object({
      property: z.string().describe("The Google Analytics Property identifier e.g. 'properties/1234567'"),
    }),
    execute: async ({ context: args }) => {
      const client = GaClient.fromEnv(env);
      
      try {
        const [response] = await client.adminClient.listGoogleAdsLinks({
          parent: args.property,
        });
        
        return { response };
      } catch (error: any) {
        throw new Error(`Failed to retrieve Google Ads links: ${error.message}`);
      }
    },
  });
