import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { MAGENTO_CANCELLATION_RATE_RESOURCE_URI } from "../../constants.ts";
import {
  assertValidCredentials,
  resolveCredentials,
} from "../../lib/client.ts";
import {
  DEFAULT_STORE_TIMEZONE,
  getRangeForPeriod,
  reportPeriodSchema,
  toMagentoUtc,
} from "../../lib/time.ts";
import type { Env } from "../../types/env.ts";
import type { SearchFilter } from "../../lib/search-criteria.ts";
import { countOrders } from "./orders-search.ts";

const TOOL_ID = "MAGENTO_CANCELLATION_RATE";

const outputSchema = z.object({
  period: reportPeriodSchema,
  canceled: z.number(),
  total: z.number(),
  /** 0-1 fraction (e.g. 0.031 = 3.1%). */
  rate: z.number(),
  startDate: z.string(),
  endDate: z.string(),
});

export const cancellationRate = (_env: Env) =>
  createTool({
    id: TOOL_ID,
    description:
      "Order cancellation rate for a period (today, last 7 days, or last 30 days). Two cheap /V1/orders total_count queries: all orders vs status=canceled.",
    inputSchema: z.object({
      period: reportPeriodSchema
        .optional()
        .describe('Reporting window: "today", "7d" or "30d" (default "today")'),
    }),
    outputSchema,
    _meta: { ui: { resourceUri: MAGENTO_CANCELLATION_RATE_RESOURCE_URI } },
    annotations: { readOnlyHint: true },
    execute: async ({ context, runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const creds = resolveCredentials(env.MESH_REQUEST_CONTEXT?.state);
      assertValidCredentials(creds, TOOL_ID);

      const timezone = creds.timezone ?? DEFAULT_STORE_TIMEZONE;
      const period = context.period ?? "today";
      const window = getRangeForPeriod(period, timezone);

      const rangeFilters: SearchFilter[] = [
        {
          field: "created_at",
          value: toMagentoUtc(window.startUtc),
          conditionType: "gteq",
        },
        {
          field: "created_at",
          value: toMagentoUtc(window.endUtc),
          conditionType: "lteq",
        },
      ];

      const [total, canceled] = await Promise.all([
        countOrders(creds, rangeFilters, TOOL_ID),
        countOrders(
          creds,
          [
            ...rangeFilters,
            { field: "status", value: "canceled", conditionType: "eq" },
          ],
          TOOL_ID,
        ),
      ]);

      return {
        period,
        canceled,
        total,
        rate: canceled / Math.max(total, 1),
        startDate: toMagentoUtc(window.startUtc),
        endDate: toMagentoUtc(window.endUtc),
      };
    },
  });
