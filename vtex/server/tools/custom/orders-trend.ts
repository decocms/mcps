import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../types/env.ts";
import {
  getVtexIdSessionToken,
  vtexIdCookieHeader,
} from "../../lib/vtexid-session.ts";

/**
 * VTEX's admin home dashboard charts are served by an INTERNAL microservice at
 * `/api/analytics/consumption/*`. It is NOT part of VTEX's public OpenAPI specs,
 * so there is no generated tool for it — hence this hand-crafted tool.
 *
 * That service rejects the usual App Key/Token headers and only accepts a VtexId
 * session token, so we mint one from the credentials via the shared
 * `lib/vtexid-session` helper. Any future internal-endpoint tool should reuse it.
 */

export interface OrdersTrendParams {
  startDate: string;
  endDate: string;
  agg: string;
  currency: string;
  timezone: string;
}

export function buildOrdersTrendUrl(
  accountName: string,
  params: OrdersTrendParams,
): string {
  const qs = new URLSearchParams({
    an: accountName,
    currency: params.currency,
    startDate: params.startDate,
    endDate: params.endDate,
    agg: params.agg,
    timezone: params.timezone,
  });
  return `https://${accountName}.vtexcommercestable.com.br/api/analytics/consumption/home-orders-trend?${qs.toString()}`;
}

// Read per-request env from `runtimeContext` — see comment in
// lib/tool-adapter.ts for why the factory's captured env is unsafe to read
// inside execute (cached registrations + fresh per-request bindings).
export const getOrdersTrend = (_env: Env) =>
  createTool({
    id: "VTEX_GET_ORDERS_TREND",
    description:
      "Get the admin home dashboard orders trend: order counts bucketed over time with anomaly forecast bands (mid/high confidence intervals and a HIGH/NORMAL status per bucket). Backed by VTEX's internal analytics service — requires App Key/Token, which are exchanged for a session token under the hood.",
    annotations: { readOnlyHint: true },
    inputSchema: z.object({
      startDate: z
        .string()
        .describe(
          "Start of the window, ISO 8601 UTC, e.g. 2026-06-23T00:00:00.000Z",
        ),
      endDate: z
        .string()
        .describe(
          "End of the window, ISO 8601 UTC, e.g. 2026-06-23T23:59:00.000Z",
        ),
      agg: z
        .enum(["hour", "day", "week", "month"])
        .default("hour")
        .describe("Time bucket granularity for the trend"),
      currency: z
        .string()
        .default("BRL")
        .describe("Currency code matching the store, e.g. BRL, USD"),
      timezone: z
        .string()
        .default("+00:00")
        .describe("Timezone offset used for bucketing, e.g. -03:00"),
    }),
    execute: async ({ context, runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const { accountName, appKey, appToken } = env.MESH_REQUEST_CONTEXT.state;

      const token = await getVtexIdSessionToken({
        accountName,
        appKey,
        appToken,
      });

      const url = buildOrdersTrendUrl(accountName, {
        startDate: context.startDate,
        endDate: context.endDate,
        agg: context.agg,
        currency: context.currency,
        timezone: context.timezone,
      });
      console.log("[VTEX] GET", url);

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          Cookie: vtexIdCookieHeader(token),
        },
      });

      if (!response.ok) {
        throw new Error(
          `VTEX API Error: ${response.status} - ${await response.text()}`,
        );
      }

      return response.json();
    },
  });
