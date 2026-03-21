/**
 * HyperDX API Client
 */

import { makeApiRequest } from "@decocms/mcps-shared/tools/utils/api-client";
import type { QueryBody } from "./types.ts";

const HYPERDX_API = "https://api.hyperdx.io/api/v1";

export interface HyperDXClientConfig {
  apiKey: string;
}

function authHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

/**
 * Query time series chart data from HyperDX
 */
export async function queryChartSeries(
  config: HyperDXClientConfig,
  queryBody: QueryBody,
): Promise<{ data?: Record<string, unknown>[] }> {
  const url = `${HYPERDX_API}/chart/series`;

  return makeApiRequest(
    url,
    {
      method: "POST",
      headers: authHeaders(config.apiKey),
      body: JSON.stringify(queryBody),
    },
    "HyperDX",
  );
}

// ============================================================================
// Alerts API
// ============================================================================

export async function listAlerts(
  config: HyperDXClientConfig,
): Promise<{ data?: Record<string, unknown>[] }> {
  return makeApiRequest(
    `${HYPERDX_API}/alerts`,
    { headers: authHeaders(config.apiKey) },
    "HyperDX",
  );
}

export async function getAlert(
  config: HyperDXClientConfig,
  id: string,
): Promise<Record<string, unknown>> {
  return makeApiRequest(
    `${HYPERDX_API}/alerts/${id}`,
    { headers: authHeaders(config.apiKey) },
    "HyperDX",
  );
}

export async function createAlert(
  config: HyperDXClientConfig,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return makeApiRequest(
    `${HYPERDX_API}/alerts`,
    {
      method: "POST",
      headers: authHeaders(config.apiKey),
      body: JSON.stringify(body),
    },
    "HyperDX",
  );
}

export async function updateAlert(
  config: HyperDXClientConfig,
  id: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return makeApiRequest(
    `${HYPERDX_API}/alerts/${id}`,
    {
      method: "PUT",
      headers: authHeaders(config.apiKey),
      body: JSON.stringify(body),
    },
    "HyperDX",
  );
}

export async function deleteAlert(
  config: HyperDXClientConfig,
  id: string,
): Promise<Record<string, unknown>> {
  return makeApiRequest(
    `${HYPERDX_API}/alerts/${id}`,
    {
      method: "DELETE",
      headers: authHeaders(config.apiKey),
    },
    "HyperDX",
  );
}

// ============================================================================
// Dashboards API
// ============================================================================

export async function listDashboards(
  config: HyperDXClientConfig,
): Promise<{ data?: Record<string, unknown>[] }> {
  return makeApiRequest(
    `${HYPERDX_API}/dashboards`,
    { headers: authHeaders(config.apiKey) },
    "HyperDX",
  );
}

export async function getDashboard(
  config: HyperDXClientConfig,
  id: string,
): Promise<Record<string, unknown>> {
  return makeApiRequest(
    `${HYPERDX_API}/dashboards/${id}`,
    { headers: authHeaders(config.apiKey) },
    "HyperDX",
  );
}

export async function createDashboard(
  config: HyperDXClientConfig,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return makeApiRequest(
    `${HYPERDX_API}/dashboards`,
    {
      method: "POST",
      headers: authHeaders(config.apiKey),
      body: JSON.stringify(body),
    },
    "HyperDX",
  );
}

export async function updateDashboard(
  config: HyperDXClientConfig,
  id: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return makeApiRequest(
    `${HYPERDX_API}/dashboards/${id}`,
    {
      method: "PUT",
      headers: authHeaders(config.apiKey),
      body: JSON.stringify(body),
    },
    "HyperDX",
  );
}

export async function deleteDashboard(
  config: HyperDXClientConfig,
  id: string,
): Promise<Record<string, unknown>> {
  return makeApiRequest(
    `${HYPERDX_API}/dashboards/${id}`,
    {
      method: "DELETE",
      headers: authHeaders(config.apiKey),
    },
    "HyperDX",
  );
}

export const createHyperDXClient = (config: HyperDXClientConfig) => ({
  queryChartSeries: (queryBody: QueryBody) =>
    queryChartSeries(config, queryBody),
  listAlerts: () => listAlerts(config),
  getAlert: (id: string) => getAlert(config, id),
  createAlert: (body: Record<string, unknown>) => createAlert(config, body),
  updateAlert: (id: string, body: Record<string, unknown>) =>
    updateAlert(config, id, body),
  deleteAlert: (id: string) => deleteAlert(config, id),
  listDashboards: () => listDashboards(config),
  getDashboard: (id: string) => getDashboard(config, id),
  createDashboard: (body: Record<string, unknown>) =>
    createDashboard(config, body),
  updateDashboard: (id: string, body: Record<string, unknown>) =>
    updateDashboard(config, id, body),
  deleteDashboard: (id: string) => deleteDashboard(config, id),
});
