import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "../../shared/deco.gen.ts";
import { GaClient } from "../lib/ga-client.ts";

const propertySchema = z
  .string()
  .describe(
    "GA4 Property identifier — 'properties/1234567' or just '1234567'.",
  );

export const listPropertyAnnotationsTool = (env: Env) =>
  createPrivateTool({
    id: "list-property-annotations",
    description:
      "Returns timestamped annotations for a GA4 property — useful for correlating traffic changes with events like campaign launches, site releases, or data collection changes.",
    inputSchema: z.object({ property: propertySchema }),
    execute: async ({ context: args }) => {
      const client = GaClient.fromEnv(env);
      try {
        const response = await client.listPropertyAnnotations(args.property);
        return { response };
      } catch (error) {
        throw new Error(
          `Failed to retrieve property annotations: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });
