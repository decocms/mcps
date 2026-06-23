import { z } from "zod";
import {
  getVtexIdSessionToken,
  vtexIdCookieHeader,
} from "../../lib/vtexid-session.ts";
import type { VTEXCredentials } from "../../types/env.ts";
import { DEFAULT_STORE_TIMEZONE } from "./orders-oms.ts";

/** Literal query string — URLSearchParams encodes `:`, which these endpoints reject. */
export function buildAnalyticsQueryString(
  params: Record<string, string | number>,
): string {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export function buildAnalyticsConsumptionUrl(
  accountName: string,
  path: string,
  params: Record<string, string | number>,
): string {
  const query = buildAnalyticsQueryString(params);
  return `https://${accountName}.myvtex.com/api/analytics/consumption/${path}?${query}`;
}

export async function fetchAnalyticsConsumption(
  creds: VTEXCredentials,
  path: string,
  params: Record<string, string | number>,
): Promise<unknown> {
  const token = await getVtexIdSessionToken(creds);
  const url = buildAnalyticsConsumptionUrl(creds.accountName, path, params);

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
}

export const analyticsStartDateSchema = z
  .string()
  .optional()
  .describe(
    "Start of the window, ISO 8601 UTC. Defaults to local midnight in timezone.",
  );

export const analyticsEndDateSchema = z
  .string()
  .optional()
  .describe("End of the window, ISO 8601 UTC. Defaults to now.");

export const analyticsCompareStartDateSchema = z
  .string()
  .optional()
  .describe(
    "Comparison window start, ISO 8601 UTC. Defaults to the same clock time on the previous day.",
  );

export const analyticsCompareEndDateSchema = z
  .string()
  .optional()
  .describe(
    "Comparison window end, ISO 8601 UTC. Defaults to the same clock time on the previous day.",
  );

export const analyticsCurrencySchema = z
  .string()
  .default("BRL")
  .describe("Currency code matching the store, e.g. BRL, USD");

export const analyticsAggSchema = z
  .enum(["hour", "day", "week", "month"])
  .default("hour")
  .describe("Time bucket granularity");

export const analyticsTimezoneSchema = z
  .string()
  .default(DEFAULT_STORE_TIMEZONE)
  .describe("Timezone offset used for default date windows, e.g. -03:00");
