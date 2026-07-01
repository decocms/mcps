import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "../../shared/deco.gen.ts";
import { GaClient } from "../lib/ga-client.ts";
import { resolveProperty } from "../lib/env.ts";
import { PropertyAnnotationsResponseSchema } from "../lib/schemas.ts";

const propertySchema = z

  .string()

  .optional()

  .describe(
    "GA4 Property identifier — 'properties/1234567' or just '1234567'. Falls back to the default propertyId configured for this integration when omitted.",
  );

export const listPropertyAnnotationsTool = (env: Env) =>
  createPrivateTool({
    id: "list-property-annotations",
    description:
      "Returns timestamped annotations for a GA4 property — useful for correlating traffic changes with events like campaign launches, site releases, or data collection changes.",
    inputSchema: z.object({ property: propertySchema }),
    outputSchema: PropertyAnnotationsResponseSchema,
    execute: async ({ context: args }) => {
      const client = GaClient.fromEnv(env);
      try {
        const result = await client.listPropertyAnnotations(
          await resolveProperty(env, client, args.property),
        );
        return PropertyAnnotationsResponseSchema.parse({ response: result });
      } catch (error) {
        throw new Error(
          `Failed to retrieve property annotations: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });
