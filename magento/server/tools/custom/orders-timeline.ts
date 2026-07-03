import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { MAGENTO_ORDERS_TIMELINE_RESOURCE_URI } from "../../constants.ts";
import {
  assertValidCredentials,
  DEFAULT_CURRENCY,
  resolveCredentials,
} from "../../lib/client.ts";
import { DEFAULT_STORE_TIMEZONE, getTodayWindow } from "../../lib/time.ts";
import type { Env } from "../../types/env.ts";
import { aggregateHourlyBuckets, searchOrders } from "./orders-search.ts";

const TOOL_ID = "MAGENTO_ORDERS_TIMELINE";

const hourBucketSchema = z.object({
  hour: z.string(),
  count: z.number(),
  totalValue: z.number(),
});

const outputSchema = z.object({
  hours: z.array(hourBucketSchema),
  date: z.string(),
  currency: z.string(),
  truncated: z.boolean(),
});

export const ordersTimeline = (_env: Env) =>
  createTool({
    id: TOOL_ID,
    description:
      "Fetch today's orders aggregated by hour for a bar chart. Queries /V1/orders with a created_at window in the store timezone and buckets results into 24 local hours.",
    inputSchema: z.object({}),
    outputSchema,
    _meta: { ui: { resourceUri: MAGENTO_ORDERS_TIMELINE_RESOURCE_URI } },
    annotations: { readOnlyHint: true },
    execute: async ({ runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const creds = resolveCredentials(env.MESH_REQUEST_CONTEXT?.state);
      assertValidCredentials(creds, TOOL_ID);

      const timezone = creds.timezone ?? DEFAULT_STORE_TIMEZONE;
      const window = getTodayWindow(timezone);
      const result = await searchOrders({ creds, window, toolId: TOOL_ID });

      return {
        hours: aggregateHourlyBuckets(result.items, window.startUtc.getTime()),
        date: window.date ?? "",
        currency: creds.currencyCode ?? DEFAULT_CURRENCY,
        truncated: result.truncated,
      };
    },
  });
