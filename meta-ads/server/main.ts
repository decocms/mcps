/**
 * Meta Ads Analytics MCP Server
 *
 * This MCP provides tools for analyzing Meta/Facebook advertising campaigns,
 * including performance metrics, insights, and detailed breakdowns.
 *
 * Authentication is handled via direct access token from Meta Graph API.
 * Users must provide their Facebook access token to use this MCP.
 *
 * Required environment variables (set as secrets in Deco/GitHub):
 * - META_ACCESS_TOKEN: Facebook Access Token (obtained from Facebook Graph API Explorer or App Dashboard)
 */
import { readFileSync } from "fs";
import { type DefaultEnv, withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";

import { tools } from "./tools/index.ts";

/**
 * Load environment variables from .dev.vars for local development
 * In production, these are injected by Deco runtime via secrets
 */
const loadEnvVars = (): Record<string, string> => {
  const vars: Record<string, string> = {};
  try {
    const text = readFileSync(".dev.vars", "utf-8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const idx = trimmed.indexOf("=");
        if (idx > 0) {
          vars[trimmed.substring(0, idx).trim()] = trimmed
            .substring(idx + 1)
            .trim();
        }
      }
    }
  } catch {
    // File doesn't exist - will use process.env (production)
  }
  return vars;
};

const envVars = loadEnvVars();

// Helper to get env var from .dev.vars or process.env
const getEnv = (key: string): string | undefined =>
  envVars[key] || process.env[key];

/**
 * Environment type for Meta Ads MCP
 */
export type Env = DefaultEnv & {
  META_ACCESS_TOKEN?: string;
};

/**
 * Get the access token from environment variables
 */
export const getMetaAccessToken = (env: Env): string => {
  // Try to get token from environment (production) or .dev.vars (local)
  const token = getEnv("META_ACCESS_TOKEN") || env.META_ACCESS_TOKEN;

  if (!token) {
    throw new Error(
      "META_ACCESS_TOKEN is required. Please configure your Facebook access token in the environment variables. " +
        "You can obtain a token from https://developers.facebook.com/tools/explorer/ or your Facebook App Dashboard.",
    );
  }

  return token;
};

const runtime = withRuntime<Env>({
  tools,
});

serve(runtime.fetch);
