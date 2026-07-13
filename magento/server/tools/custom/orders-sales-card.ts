import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { MAGENTO_ORDERS_SALES_CARD_RESOURCE_URI } from "../../constants.ts";
import {
  assertValidCredentials,
  DEFAULT_CURRENCY,
  resolveCredentials,
} from "../../lib/client.ts";
import {
  DEFAULT_STORE_TIMEZONE,
  getTodayWindow,
  salesPeriodSchema,
  type SalesPeriod,
} from "../../lib/time.ts";
import type { Env } from "../../types/env.ts";
import { aggregateWindowStats, searchOrders } from "./orders-search.ts";

const TOOL_ID = "MAGENTO_ORDERS_SALES_CARD";

const ALL_SALES_PERIODS = ["today", "last_1h", "last_5min"] as const;

/** Rolling window sizes (ms). last_1h uses 65min headroom absorbed at filter time. */
const PERIOD_WINDOW_MS: Record<Exclude<SalesPeriod, "today">, number> = {
  last_1h: 60 * 60_000,
  last_5min: 5 * 60_000,
};

const salesCardSchema = z.object({
  period: salesPeriodSchema,
  orders: z.number(),
  totalValue: z.number(),
  date: z.string().optional(),
});

const outputSchema = z.object({
  cards: z.array(salesCardSchema),
  currency: z.string(),
  truncated: z.boolean(),
});

export const ordersSalesCard = (_env: Env) =>
  createTool({
    id: TOOL_ID,
    description:
      "Sales summary cards for today, last hour, and last 5 minutes (default). Single /V1/orders query covering all windows, aggregated in memory. Pass an optional period to return a single card only.",
    inputSchema: z.object({
      period: salesPeriodSchema
        .optional()
        .describe(
          'Optional single window: "today", "last_1h", or "last_5min". Omit to return all three.',
        ),
    }),
    outputSchema,
    _meta: { ui: { resourceUri: MAGENTO_ORDERS_SALES_CARD_RESOURCE_URI } },
    annotations: { readOnlyHint: true },
    execute: async ({ context, runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const creds = resolveCredentials(env.MESH_REQUEST_CONTEXT);
      assertValidCredentials(creds, TOOL_ID);

      const timezone = creds.timezone ?? DEFAULT_STORE_TIMEZONE;
      const now = new Date();
      const today = getTodayWindow(timezone, now);
      // Just after local midnight "last_1h" reaches into yesterday — widen the
      // fetch window so a single query covers every card.
      const fetchStartMs = Math.min(
        today.startUtc.getTime(),
        now.getTime() - PERIOD_WINDOW_MS.last_1h - 5 * 60_000,
      );

      const result = await searchOrders({
        creds,
        window: { startUtc: new Date(fetchStartMs), endUtc: now },
        toolId: TOOL_ID,
      });

      const periods = context.period
        ? [context.period]
        : [...ALL_SALES_PERIODS];

      const cards = periods.map((period) => {
        const startMs =
          period === "today"
            ? today.startUtc.getTime()
            : now.getTime() - PERIOD_WINDOW_MS[period];
        const stats = aggregateWindowStats(result.items, startMs);
        return {
          period,
          orders: stats.orders,
          totalValue: stats.totalValue,
          ...(period === "today" && today.date ? { date: today.date } : {}),
        };
      });

      return {
        cards,
        currency: creds.currencyCode ?? DEFAULT_CURRENCY,
        truncated: result.truncated,
      };
    },
  });
