import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "../../shared/deco.gen.ts";
import { GaClient } from "../lib/ga-client.ts";
import { AccountSummariesOutputSchema } from "../lib/schemas.ts";

export const getAccountSummariesTool = (env: Env) =>
  createPrivateTool({
    id: "get-account-summaries",
    description:
      "Retrieves information about the user's Google Analytics accounts and properties.",
    inputSchema: z.object({}),
    outputSchema: AccountSummariesOutputSchema,
    execute: async () => {
      const client = GaClient.fromEnv(env);
      try {
        const result = await client.listAccountSummaries();
        return AccountSummariesOutputSchema.parse(result);
      } catch (error) {
        throw new Error(
          `Failed to retrieve account summaries: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });
