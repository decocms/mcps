import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { MAGENTO_TOP_PRODUCTS_RESOURCE_URI } from "../../constants.ts";
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
import {
  aggregateTopProducts,
  ORDER_WITH_LINES_FIELDS,
  searchOrders,
} from "./orders-search.ts";

const TOOL_ID = "MAGENTO_TOP_PRODUCTS";

const DEFAULT_LIMIT = 10;

const productSchema = z.object({
  sku: z.string(),
  name: z.string(),
  quantity: z.number(),
  revenue: z.number(),
  orders: z.number(),
});

const outputSchema = z.object({
  products: z.array(productSchema),
  period: reportPeriodSchema,
  startDate: z.string(),
  endDate: z.string(),
  currency: z.string(),
  truncated: z.boolean(),
});

export const topProducts = (_env: Env) =>
  createTool({
    id: TOOL_ID,
    description:
      "Top selling products by quantity for a period (today, last 7 days, or last 30 days). Fetches orders with line items from /V1/orders and aggregates by SKU (top-level items only, so configurable children are not double-counted).",
    inputSchema: z.object({
      period: reportPeriodSchema
        .optional()
        .describe('Reporting window: "today", "7d" or "30d" (default "today")'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("How many products to return (default 10)"),
    }),
    outputSchema,
    _meta: { ui: { resourceUri: MAGENTO_TOP_PRODUCTS_RESOURCE_URI } },
    annotations: { readOnlyHint: true },
    execute: async ({ context, runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const creds = resolveCredentials(env.MESH_REQUEST_CONTEXT?.state);
      assertValidCredentials(creds, TOOL_ID);

      const timezone = creds.timezone ?? DEFAULT_STORE_TIMEZONE;
      const period = context.period ?? "today";
      const window = getRangeForPeriod(period, timezone);

      const result = await searchOrders({
        creds,
        window,
        fields: ORDER_WITH_LINES_FIELDS,
        toolId: TOOL_ID,
      });

      return {
        products: aggregateTopProducts(
          result.items,
          context.limit ?? DEFAULT_LIMIT,
        ),
        period,
        startDate: toMagentoUtc(window.startUtc),
        endDate: toMagentoUtc(window.endUtc),
        currency: creds.currencyCode ?? DEFAULT_CURRENCY,
        truncated: result.truncated,
      };
    },
  });
