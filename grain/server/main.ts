/**
 * Grain MCP Server
 *
 * This MCP provides tools for interacting with Grain's API.
 *
 * Grain is an AI-powered meeting recorder and note-taking tool that
 * automatically joins calls, records, transcribes, and creates notes.
 * This integration allows you to:
 * - List and access meeting recordings
 * - Get transcripts from recordings
 * - Receive webhook events for new recordings
 * - Store recordings in PostgreSQL
 */
import { type DefaultEnv, withRuntime } from "@decocms/runtime";

import { GRAIN_BASE_URL, GRAIN_OAUTH_TOKEN_ENDPOINT } from "./constants.ts";
import { GrainClient } from "./lib/client.ts";
import { ensureRecordingsTable, runSQL } from "./lib/postgres.ts";
import { tools } from "./tools/index.ts";
import {
  type Env as DecoEnv,
  Scopes,
  StateSchema,
} from "../shared/deco.gen.ts";

/**
 * Environment type combining Deco bindings and Cloudflare Workers context
 */
export type Env = DefaultEnv<typeof StateSchema> &
  DecoEnv & {
    GRAIN_API_KEY?: string;
    GRAIN_API_URL?: string;
  };

const runtime = withRuntime<Env, typeof StateSchema>({
  oauth: {
    mode: "PKCE",
    // Used in protected resource metadata to point to the auth server
    authorizationServer: "https://grain.com",

    // Generates the URL to redirect users to for authorization
    authorizationUrl: (callbackUrl) => {
      const url = new URL("https://grain.com/oauth/authorize");
      url.searchParams.set("callback_url", callbackUrl);
      url.searchParams.set("response_type", "code");
      // PKCE parameters will be added automatically by the runtime
      return url.toString();
    },

    // Exchanges the authorization code for an access token
    exchangeCode: async ({ code, code_verifier, code_challenge_method }) => {
      const response = await fetch(
        `${GRAIN_BASE_URL}${GRAIN_OAUTH_TOKEN_ENDPOINT}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            code_verifier,
            code_challenge_method,
            grant_type: "authorization_code",
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          `Grain OAuth failed: ${response.status} - ${errorText}`,
        );
      }

      const data = (await response.json()) as {
        access_token: string;
        token_type: string;
        expires_in?: number;
        refresh_token?: string;
      };

      return {
        access_token: data.access_token,
        token_type: data.token_type || "Bearer",
        expires_in: data.expires_in,
        refresh_token: data.refresh_token,
      };
    },
  },
  configuration: {
    onChange: async (env) => {
      // Create the recordings table if it doesn't exist
      await ensureRecordingsTable(env);

      // Get mesh context for webhook registration
      const meshContext = env.MESH_REQUEST_CONTEXT;
      if (!meshContext) {
        console.warn(
          "MESH_REQUEST_CONTEXT not available, skipping webhook setup",
        );
        return;
      }

      const token = meshContext.token || meshContext.authorization;
      if (!token) {
        console.warn("No auth token available, skipping webhook setup");
        return;
      }

      const meshUrl = meshContext.meshUrl;
      const connectionId = meshContext.connectionId;

      if (!meshUrl || !connectionId) {
        console.warn(
          "meshUrl or connectionId not available, skipping webhook setup",
        );
        return;
      }

      // Create webhook URL pointing to the event bus
      const webhookUrl = `${meshUrl}/events/grain_record?sub=${connectionId}`;

      try {
        // Register webhook with Grain
        const client = new GrainClient({ apiKey: token });
        const hook = await client.createHook(webhookUrl);
        console.log(`Grain webhook created: ${hook.id} -> ${hook.hook_url}`);
      } catch (error) {
        console.error("Failed to create Grain webhook:", error);
        // Don't throw - allow configuration to continue even if webhook setup fails
      }
    },
    scopes: [Scopes.DATABASE.DATABASES_RUN_SQL],
    state: StateSchema,
  },
  // Event handler for processing webhook events
  // Note: eventHandler implementation will be added once the runtime fully supports it
  // For now, webhooks are registered and events can be processed through a separate endpoint
  // TODO: Implement eventHandler when runtime API is stable
  // eventHandler: async (event: { type: string; payload: unknown; sub?: string }, env: Env) => {
  //   if (event.type === "grain_record") {
  //     const recording = event.payload as Record<string, unknown>;
  //     const connectionId = event.sub;
  //     await runSQL(env, `INSERT INTO grain_recordings ...`, [...]);
  //   }
  // },
  tools,
  bindings: [
    {
      type: "mcp",
      name: "DATABASE",
      app_name: "@deco/postgres",
    },
  ],
});

export default runtime;
