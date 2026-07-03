import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { MAGENTO_STATUS_BREAKDOWN_RESOURCE_URI } from "../../constants.ts";
import {
  assertValidCredentials,
  DEFAULT_CURRENCY,
  resolveCredentials,
} from "../../lib/client.ts";
import {
  DEFAULT_STORE_TIMEZONE,
  getRangeForPeriod,
  reportPeriodSchema,
  toMagentoUtc,
} from "../../lib/time.ts";
import type { Env } from "../../types/env.ts";
import { aggregateByStatus, searchOrders } from "./orders-search.ts";

const TOOL_ID = "MAGENTO_STATUS_BREAKDOWN";

const statusBucketSchema = z.object({
  status: z.string(),
  count: z.number(),
  totalValue: z.number(),
});

const outputSchema = z.object({
  statuses: z.array(statusBucketSchema),
  total: z.number(),
  period: reportPeriodSchema,
  startDate: z.string(),
  endDate: z.string(),
  currency: z.string(),
  truncated: z.boolean(),
});

export const statusBreakdown = (_env: Env) =>
  createTool({
    id: TOOL_ID,
    description:
      "Orders grouped by status (processing, complete, canceled, pending…) for a period (today, last 7 days, or last 30 days), with count and grand_total sum per status. Useful for a donut chart of order health.",
    inputSchema: z.object({
      period: reportPeriodSchema
        .optional()
        .describe('Reporting window: "today", "7d" or "30d" (default "today")'),
    }),
    outputSchema,
    _meta: { ui: { resourceUri: MAGENTO_STATUS_BREAKDOWN_RESOURCE_URI } },
    annotations: { readOnlyHint: true },
    execute: async ({ context, runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const creds = resolveCredentials(env.MESH_REQUEST_CONTEXT?.state);
      assertValidCredentials(creds, TOOL_ID);

      const timezone = creds.timezone ?? DEFAULT_STORE_TIMEZONE;
      const period = context.period ?? "today";
      const window = getRangeForPeriod(period, timezone);

      const result = await searchOrders({ creds, window, toolId: TOOL_ID });
      const statuses = aggregateByStatus(result.items);

      return {
        statuses,
        total: result.totalCount,
        period,
        startDate: toMagentoUtc(window.startUtc),
        endDate: toMagentoUtc(window.endUtc),
        currency: creds.currencyCode ?? DEFAULT_CURRENCY,
        truncated: result.truncated,
      };
    },
  });
