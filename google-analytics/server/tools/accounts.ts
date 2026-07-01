import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "../../shared/deco.gen.ts";
import { GaClient } from "../lib/ga-client.ts";
import { getAllowedPropertyIds } from "../lib/env.ts";
import { AccountSummariesResponseSchema } from "../lib/schemas.ts";

export const getAccountSummariesTool = (env: Env) =>
  createPrivateTool({
    id: "get-account-summaries",
    description:
      "Retrieves information about the user's Google Analytics accounts and properties.",
    inputSchema: z.object({}),
    outputSchema: AccountSummariesResponseSchema,
    execute: async () => {
      const client = GaClient.fromEnv(env);

      try {
        const result = (await client.listAccountSummaries()) as {
          accountSummaries?: Array<{
            name: string;
            account?: string;
            displayName?: string;
            propertySummaries?: Array<{
              property: string;
              displayName: string;
              propertyType?: string;
              parent?: string;
            }>;
          }>;
        };
        const allowed = getAllowedPropertyIds(env);

        if (allowed) {
          const filtered = (result.accountSummaries ?? [])
            .map((account) => ({
              ...account,
              propertySummaries: (account.propertySummaries ?? []).filter(
                (prop) => allowed.includes(prop.property),
              ),
            }))
            .filter((account) => account.propertySummaries.length > 0);

          return AccountSummariesResponseSchema.parse({
            response: { accountSummaries: filtered },
          });
        }

        return AccountSummariesResponseSchema.parse({ response: result });
      } catch (error) {
        throw new Error(
          `Failed to retrieve account summaries: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });
