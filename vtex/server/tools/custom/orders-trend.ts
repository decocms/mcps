import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../types/env.ts";

/**
 * VTEX's admin home dashboard charts are served by an INTERNAL microservice at
 * `/api/analytics/consumption/*`. It is NOT part of VTEX's public OpenAPI specs,
 * so there is no generated tool for it — hence this hand-crafted tool.
 *
 * The catch: that service REJECTS the usual `X-VTEX-API-AppKey` /
 * `X-VTEX-API-AppToken` headers with 401. It only accepts a VtexId session
 * token. So we first exchange the App Key/Token for a short-lived session token
 * via `/api/vtexid/apptoken/login`, then call the analytics endpoint passing the
 * token as the `VtexIdclientAutCookie` cookie.
 */

export function buildAppTokenLoginUrl(accountName: string): string {
  return `https://${accountName}.vtexcommercestable.com.br/api/vtexid/apptoken/login?an=${encodeURIComponent(
    accountName,
  )}`;
}

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

/** Exchange App Key/Token for a VtexId session token. */
export async function loginWithAppToken(
  accountName: string,
  appKey: string,
  appToken: string,
): Promise<string> {
  const response = await fetch(buildAppTokenLoginUrl(accountName), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ appkey: appKey, apptoken: appToken }),
  });

  if (!response.ok) {
    throw new Error(
      `VTEX appToken login failed: ${response.status} - ${await response.text()}`,
    );
  }

  const data = (await response.json()) as { token?: string };
  if (!data.token) {
    throw new Error(
      "VTEX appToken login succeeded but no token was returned in the response.",
    );
  }
  return data.token;
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

      if (!accountName) {
        throw new Error(
          "VTEX accountName is missing — set MESH_REQUEST_CONTEXT.state.accountName.",
        );
      }
      if (!appKey || !appToken) {
        throw new Error(
          "VTEX_GET_ORDERS_TREND requires appKey and appToken — the analytics service rejects unauthenticated requests.",
        );
      }

      const token = await loginWithAppToken(accountName, appKey, appToken);

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
          Cookie: `VtexIdclientAutCookie=${token}`,
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
