import type { Registry } from "@decocms/mcps-shared/registry";
import { type DefaultEnv } from "@decocms/runtime";
import z from "zod";

/**
 * Azure AD client credentials are configured server-side via env vars
 * (MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET).
 *
 * The Studio shows a "Connect to Microsoft" button that drives the OAuth
 * Authorization Code flow — bearer token is then injected per-request via
 * MESH_REQUEST_CONTEXT.authorization. No credentials live in this schema.
 *
 * Optional state for trigger configuration only.
 */
export const StateSchema = z.object({
  // Webhook URL shown to the user so they know where Graph notifications land
  WEBHOOK_URL: z
    .string()
    .default(
      "https://graph-mcp.decocms.com/teams/notifications/{connectionId}",
    )
    .readonly()
    .describe(
      "Endpoint where Microsoft Graph change notifications are delivered. When developing locally, expose this via ngrok.",
    ),

  // Notification client state — secret used to validate incoming Graph notifications
  NOTIFICATION_CLIENT_STATE: z
    .string()
    .default("teams-mcp-secret")
    .describe(
      "Secret string sent with every Graph subscription and echoed back in notifications. Change to any random string for production.",
    ),

  // Channels to subscribe to for incoming-message triggers
  SUBSCRIBED_CHANNELS: z
    .array(
      z.object({
        TEAM_ID: z.string().describe("Teams team ID"),
        CHANNEL_ID: z.string().describe("Teams channel ID"),
      }),
    )
    .optional()
    .describe(
      "List of channels to subscribe to for the teams.message.received trigger. Each entry creates a Graph change-notification subscription.",
    ),

  CONNECTION_NAME: z
    .string()
    .optional()
    .describe(
      "Friendly name for this connection (e.g., 'Acme Corp Teams'). Used in logs.",
    ),
});

/** Minimal Cloudflare Workers KV namespace surface we rely on. */
export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; cursor?: string }): Promise<{
    keys: Array<{ name: string }>;
    list_complete: boolean;
    cursor?: string;
  }>;
}

/**
 * Environment combining Deco bindings with the Workers KV namespace and the
 * Azure AD secrets. Secrets arrive via `wrangler secret put` and are exposed
 * through `process.env` under `nodejs_compat`.
 */
export type Env = DefaultEnv<typeof StateSchema, Registry> & {
  TEAMS_KV?: KVNamespace;
  MICROSOFT_TENANT_ID?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
};

export type { Registry };
