/**
 * Meta Ads Analytics MCP Server
 *
 * This MCP provides tools for analyzing Meta/Facebook advertising campaigns,
 * including performance metrics, insights, and detailed breakdowns.
 *
 * Authentication is handled via direct access token from Meta Graph API.
 * Users must provide their Facebook access token to use this MCP.
 */
import { readFileSync } from "fs";
import { type DefaultEnv, withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import {
  type Env as DecoEnv,
  StateSchema as BaseStateSchema,
} from "../shared/deco.gen.ts";

import { tools } from "./tools/index.ts";
import { z } from "zod";

/**
 * State schema for Meta Ads MCP configuration.
 * Users fill these values when installing the MCP.
 */
export const StateSchema = BaseStateSchema.extend({
  accessToken: z
    .string()
    .describe(
      "Facebook Access Token from https://developers.facebook.com/tools/explorer/. " +
        "Select your app and generate token with required permissions: ads_read, ads_management, pages_read_engagement, business_management",
    ),
});

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
export type Env = DefaultEnv<typeof StateSchema> &
  DecoEnv & {
    META_ACCESS_TOKEN?: string;
    ASSETS?: {
      fetch: (request: Request, init?: RequestInit) => Promise<Response>;
    };
  };

/**
 * Get the access token from state (user configuration) or environment variables (fallback)
 */
export const getMetaAccessToken = (env: Env): string => {
  // First, try to get token from state (user configuration when installing MCP)
  const stateToken = (env.state as z.infer<typeof StateSchema> | undefined)
    ?.accessToken;

  // Fallback to environment variable (for local development or legacy setups)
  const envToken = getEnv("META_ACCESS_TOKEN") || env.META_ACCESS_TOKEN;

  const token = stateToken || envToken;

  if (!token) {
    throw new Error(
      "Facebook access token is required. Please configure your access token when installing this MCP. " +
        "You can obtain a token from https://developers.facebook.com/tools/explorer/ " +
        "with permissions: ads_read, ads_management, pages_read_engagement, business_management",
    );
  }

  return token;
};

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    /**
     * These scopes define the asking permissions of your
     * app when a user is installing it.
     */
    scopes: [],
    /**
     * The state schema defines what fields users need to fill when installing the MCP.
     * In this case, users provide their Facebook access token.
     */
    state: StateSchema,
  },
  tools,
  /**
   * Fallback directly to assets for all requests that do not match a tool or auth.
   */
  fetch: (req, env) =>
    env.ASSETS?.fetch(req) || new Response("Not Found", { status: 404 }),
});

serve(runtime.fetch);
