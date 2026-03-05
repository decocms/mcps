import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { makeRequest } from "../../../lib/strapi.api.ts";
import type { Env } from "../../../types/env.ts";

export const createStrapiHealthTool = (env: Env) =>
  createTool({
    id: "STRAPI_HEALTH",
    description: "Verifica se o Strapi está acessível e mede latência.",
    inputSchema: z.object({}), // sem parâmetros
    outputSchema: z.object({
      ok: z.boolean(),
      endpointUsed: z.string(),
      status: z.number().optional(),
      latencyMs: z.number(),
      details: z.any().optional(),
    }),
    execute: async () => {
      const start = Date.now();

      try {
        // 1) tenta rota _health
        const resHealth = await makeRequest(env, "_health", "GET");
        if (resHealth && resHealth.status && resHealth.status < 500) {
          return {
            ok: true,
            endpointUsed: "/_health",
            status: resHealth.status,
            latencyMs: resHealth.duration ?? Date.now() - start,
            details: resHealth.data,
          };
        }

        // 2) fallback: api/users/me
        const resMe = await makeRequest(env, "api/users/me", "GET", {
          populate: "role",
        });
        return {
          ok: resMe.success,
          endpointUsed: "/api/users/me",
          status: resMe.status,
          latencyMs: resMe.duration ?? Date.now() - start,
          details: resMe.data,
        };
      } catch (err: any) {
        return {
          ok: false,
          endpointUsed: "probe:_health -> /api/users/me error",
          status: undefined,
          latencyMs: Date.now() - start,
          details: err?.message ?? String(err),
        };
      }
    },
  });

export const strapiHealthTools = [createStrapiHealthTool];
