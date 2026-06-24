import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "../../shared/deco.gen.ts";
import { GaClient } from "../lib/ga-client.ts";
import { GoogleAdsLinksOutputSchema } from "../lib/schemas.ts";

const propertySchema = z
  .string()
  .describe(
    "GA4 Property identifier — 'properties/1234567' or just '1234567'.",
  );

export const listGoogleAdsLinksTool = (env: Env) =>
  createPrivateTool({
    id: "list-google-ads-links",
    description:
      "Returns a list of links to Google Ads accounts for a GA4 property.",
    inputSchema: z.object({ property: propertySchema }),
    outputSchema: GoogleAdsLinksOutputSchema,
    execute: async ({ context: args }) => {
      const client = GaClient.fromEnv(env);
      try {
        const result = await client.listGoogleAdsLinks(args.property);
        return GoogleAdsLinksOutputSchema.parse(result);
      } catch (error) {
        throw new Error(
          `Failed to retrieve Google Ads links: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });
