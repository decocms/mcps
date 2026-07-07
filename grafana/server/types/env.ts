/**
 * Environment / configuration for the Grafana MCP (self-hosted focused).
 *
 * The user provides their own Grafana base URL + a service-account token
 * (Administration → Service accounts → Add token). Works with any self-hosted
 * or Grafana Cloud instance reachable over HTTPS.
 */

import type { DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  GRAFANA_URL: z
    .string()
    .describe(
      "Base URL of your Grafana instance, e.g. https://grafana.example.com (trailing slash optional).",
    ),
  GRAFANA_API_TOKEN: z
    .string()
    .describe(
      "Grafana service-account token (Administration → Service accounts → Add token). Sent as a Bearer token. Viewer role is enough for querying.",
    ),
  GRAFANA_DATASOURCE_UID: z
    .string()
    .optional()
    .describe(
      "Optional default datasource UID used by GRAFANA_QUERY_PROMETHEUS when none is passed.",
    ),
});

export type Env = DefaultEnv<typeof StateSchema>;

/** Read the Grafana connection config from the mesh request state (falls back to process.env for stdio). */
export function grafanaConfig(env: Env): {
  url: string;
  token: string;
  defaultDatasourceUid?: string;
} {
  const state = env.MESH_REQUEST_CONTEXT?.state as
    | {
        GRAFANA_URL?: string;
        GRAFANA_API_TOKEN?: string;
        GRAFANA_DATASOURCE_UID?: string;
      }
    | undefined;
  const url = (state?.GRAFANA_URL ?? process.env.GRAFANA_URL ?? "").replace(
    /\/$/,
    "",
  );
  const token = state?.GRAFANA_API_TOKEN ?? process.env.GRAFANA_API_TOKEN ?? "";
  const defaultDatasourceUid =
    state?.GRAFANA_DATASOURCE_UID ?? process.env.GRAFANA_DATASOURCE_UID;
  if (!url || !token) {
    throw new Error(
      "Grafana not configured: set GRAFANA_URL and GRAFANA_API_TOKEN in the connection settings.",
    );
  }
  return { url, token, defaultDatasourceUid };
}
