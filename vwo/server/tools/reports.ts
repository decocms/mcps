import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import { getAccountId, getApiToken } from "../lib/env.ts";
import { VWOClient } from "../lib/vwo-client.ts";

export const createGetMetricReportTool = (env: Env) =>
  createPrivateTool({
    id: "vwo_get_metric_report",
    description:
      "Get a metric/insights report by ID with historical performance data and statistical information.",
    inputSchema: z.object({
      accountId: z
        .string()
        .optional()
        .describe("Account ID override. Uses default if not provided."),
      reportId: z.string().describe("Metric report ID"),
    }),
    execute: async ({ context }) => {
      const client = new VWOClient(getApiToken(env));
      return await client.getMetricReport(
        getAccountId(env, context.accountId),
        context.reportId,
      );
    },
  });

export const reportTools = [createGetMetricReportTool];
