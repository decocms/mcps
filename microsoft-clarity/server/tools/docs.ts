import { createPrivateTool } from "@decocms/runtime/tools";
import { SearchRequest } from "../types/clarity.ts";
import { callClarityApi } from "../lib/clarity.ts";
import { z } from "zod";
import type { Env } from "../main.ts";

export const queryDocumentationResources = (env: Env) =>
  createPrivateTool({
    id: "query-documentation-resources",
    description:
      "Authoritative answers to Clarity setup, features, troubleshooting, and integrations. This tool retrieves snippets from Microsoft Clarity documentation to find answers to user questions.",
    inputSchema: SearchRequest,
    outputSchema: z
      .any()
      .describe("Clarity documentation snippets and answers"),
    execute: async ({ context }) => {
      const { query, token } = context;

      const result = await callClarityApi(env, "/documentation/query", {
        method: "POST",
        token,
        body: { query },
      });

      return result;
    },
  });
