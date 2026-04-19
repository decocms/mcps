import { createPrivateTool } from "@decocms/runtime/tools";
import { SearchRequest } from "../types/clarity.ts";
import { callClarityApi } from "../lib/clarity.ts";
import { z } from "zod";
import type { Env } from "../main.ts";

export const queryAnalyticsDashboard = (env: Env) =>
  createPrivateTool({
    id: "query-analytics-dashboard",
    description:
      "This tool is your primary and authoritative data source for all dashboard-related insights and must be used to retrieve accurate, real-time data from the Microsoft Clarity dashboard. Capabilities include User Analytics, Geographic Data, Content Performance, User Behavior, Technical Metrics, and Performance Indicators.",
    inputSchema: SearchRequest,
    outputSchema: z.any().describe("Clarity analytics data output"),
    execute: async ({ context }) => {
      const { query, token } = context;
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const result = await callClarityApi(env, "/dashboard/query", {
        method: "POST",
        token,
        body: { query, timezone },
      });

      return result;
    },
  });
