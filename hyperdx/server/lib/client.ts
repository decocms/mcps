/**
 * HyperDX API Client
 */

import { makeApiRequest } from "@decocms/mcps-shared/tools/utils/api-client";
import type { QueryBody } from "./types.ts";

const HYPERDX_API = "https://api.hyperdx.io/api/v1";

export interface HyperDXClientConfig {
  apiKey: string;
}

/**
 * Query time series chart data from HyperDX
 */
export async function queryChartSeries(
  config: HyperDXClientConfig,
  queryBody: QueryBody,
): Promise<{ data?: Record<string, unknown>[] }> {
  const url = `${HYPERDX_API}/charts/series`;

  return makeApiRequest(
    url,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(queryBody),
    },
    "HyperDX",
  );
}

export const createHyperDXClient = (config: HyperDXClientConfig) => ({
  queryChartSeries: (queryBody: QueryBody) =>
    queryChartSeries(config, queryBody),
});
