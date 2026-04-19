import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "../types/env.ts";
import { GaClient } from "../lib/ga-client.ts";

export const getAccountSummariesTool = (env: Env) =>
  createPrivateTool({
    id: "get-account-summaries",
    description: "Retrieves information about the user's Google Analytics accounts and properties.",
    inputSchema: z.object({}),
    execute: async () => {
      const client = GaClient.fromEnv(env);
      
      try {
        const [response] = await client.adminClient.listAccountSummaries({});
        
        return {
           response: response
        };
      } catch (error: any) {
        throw new Error(`Failed to retrieve account summaries: ${error.message}`);
      }
    },
  });
