/**
 * HyperDX API Client
 */

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
): Promise<any> {
  const url = `${HYPERDX_API}/charts/series`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(queryBody),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HyperDX API error (${response.status}): ${text}`);
  }

  return response.json();
}

export const createHyperDXClient = (config: HyperDXClientConfig) => ({
  queryChartSeries: (queryBody: QueryBody) =>
    queryChartSeries(config, queryBody),
});
