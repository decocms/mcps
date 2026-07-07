/** Datasource + query tools. */

import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { dsQuery, grafanaFetch } from "../lib/client.ts";
import { grafanaConfig, type Env } from "../types/env.ts";

export const createListDatasourcesTool = (env: Env) =>
  createTool({
    id: "GRAFANA_LIST_DATASOURCES",
    description:
      "List the datasources configured in Grafana (id, uid, name, type). Use the uid with GRAFANA_QUERY / GRAFANA_QUERY_PROMETHEUS.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      datasources: z.array(
        z.object({
          uid: z.string(),
          name: z.string(),
          type: z.string(),
        }),
      ),
    }),
    execute: async () => {
      const rows = await grafanaFetch<
        Array<{ uid: string; name: string; type: string }>
      >(env, "/api/datasources");
      return {
        datasources: (rows ?? []).map((d) => ({
          uid: d.uid,
          name: d.name,
          type: d.type,
        })),
      };
    },
  });

export const createQueryTool = (env: Env) =>
  createTool({
    id: "GRAFANA_QUERY",
    description:
      "Run a raw Grafana datasource query via POST /api/ds/query. `queries` is the native Grafana query array (each item must include a `datasource` with `uid`, plus datasource-specific fields like `expr` for Prometheus or `rawSql` for SQL). Returns the raw Grafana frames response.",
    inputSchema: z.object({
      queries: z
        .array(z.record(z.string(), z.unknown()))
        .describe("Native Grafana query objects passed through untouched."),
      from: z
        .string()
        .optional()
        .describe("Range start (e.g. 'now-6h' or epoch ms as string)."),
      to: z.string().optional().describe("Range end (e.g. 'now')."),
    }),
    outputSchema: z.object({ result: z.record(z.string(), z.unknown()) }),
    execute: async ({ context }) => {
      const range =
        context.from && context.to
          ? { from: context.from, to: context.to }
          : undefined;
      const result = await dsQuery(
        env,
        context.queries as Array<Record<string, unknown>>,
        range,
      );
      return { result };
    },
  });

export const createQueryPrometheusTool = (env: Env) =>
  createTool({
    id: "GRAFANA_QUERY_PROMETHEUS",
    description:
      "Convenience wrapper to run a PromQL expression against a Prometheus datasource via /api/ds/query. Defaults to an instant query at `now`; pass from/to/step for a range query.",
    inputSchema: z.object({
      expr: z.string().describe("PromQL expression."),
      datasourceUid: z
        .string()
        .optional()
        .describe(
          "Prometheus datasource uid (defaults to GRAFANA_DATASOURCE_UID).",
        ),
      instant: z
        .boolean()
        .default(true)
        .describe("true = instant query (single value); false = range query."),
      from: z.string().default("now-1h").describe("Range start (range mode)."),
      to: z.string().default("now").describe("Range end (range mode)."),
      step: z
        .number()
        .optional()
        .describe("Range step in seconds (range mode)."),
    }),
    outputSchema: z.object({ result: z.record(z.string(), z.unknown()) }),
    execute: async ({ context }) => {
      const { defaultDatasourceUid } = grafanaConfig(env);
      const uid = context.datasourceUid ?? defaultDatasourceUid;
      if (!uid) {
        throw new Error(
          "No datasource uid: pass datasourceUid or set GRAFANA_DATASOURCE_UID.",
        );
      }
      const query: Record<string, unknown> = {
        refId: "A",
        datasource: { type: "prometheus", uid },
        expr: context.expr,
        instant: context.instant,
        range: !context.instant,
        ...(context.step ? { intervalMs: context.step * 1000 } : {}),
      };
      const result = await dsQuery(env, [query], {
        from: context.from,
        to: context.to,
      });
      return { result };
    },
  });
