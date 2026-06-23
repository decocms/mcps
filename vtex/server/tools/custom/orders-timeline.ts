import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEX_RESOURCE_URI } from "../../constants.ts";
import type { Env } from "../../types/env.ts";
import {
  buildOmsHeaders,
  buildOmsOrdersUrl,
  DEFAULT_STORE_TIMEZONE,
  fetchHourlyBuckets,
  getTodayWindowInTimezone,
} from "./orders-oms.ts";

const hourBucketSchema = z.object({
  hour: z.string(),
  count: z.number(),
  totalValue: z.number(),
});

const outputSchema = z.object({
  hours: z.array(hourBucketSchema),
  date: z.string(),
});

export const ordersTimeline = (_env: Env) =>
  createTool({
    id: "VTEX_ORDERS_TIMELINE",
    description:
      "Fetch today's orders aggregated by hour for a bar chart. Uses OMS List Orders with _stats=1 (one request per elapsed hour today).",
    inputSchema: z.object({}),
    outputSchema,
    _meta: { ui: { resourceUri: VTEX_RESOURCE_URI } },
    annotations: { readOnlyHint: true },
    execute: async ({ runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const { accountName, appKey, appToken } = env.MESH_REQUEST_CONTEXT.state;
      const timezone = DEFAULT_STORE_TIMEZONE;
      const { date } = getTodayWindowInTimezone(timezone);

      const creds = { accountName, appKey, appToken };
      const hours = await fetchHourlyBuckets(
        buildOmsOrdersUrl(accountName),
        buildOmsHeaders(creds),
        date,
        timezone,
      );

      return { hours, date };
    },
  });
