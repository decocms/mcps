import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { verifyCredentials } from "../lib/client.ts";
import { getApiKey, getAppKey } from "../lib/env.ts";
import type { Env } from "../types/env.ts";

const inputSchema = z.object({});

const outputSchema = z.object({
  authenticated: z.boolean(),
  error: z.string().optional(),
});

export const verifyCredentialsTool = (_env: Env) =>
  createTool({
    id: "crazy_egg_verify_credentials",
    description:
      "Check whether the configured CRAZY_EGG_API_KEY + CRAZY_EGG_APP_KEY pair can authenticate against the legacy v2 API. Use this first to diagnose 'unauthorized' errors from the read tools.",
    inputSchema,
    outputSchema,

    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async ({ runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const apiKey = getApiKey(env);
      const appKey = getAppKey(env);

      try {
        await verifyCredentials({ apiKey, appKey });
        return { authenticated: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { authenticated: false, error: message };
      }
    },
  });
