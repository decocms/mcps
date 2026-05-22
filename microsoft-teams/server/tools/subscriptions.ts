/**
 * Subscription management — agent-driven lifecycle for Graph change notifications.
 *
 * With deco-native OAuth there is no per-request access to the refresh token,
 * so subscription creation/renewal is triggered explicitly by the agent.
 * Each call uses the current request's bearer token (delegated) to:
 *  - Create a Graph subscription
 *  - Persist {clientState, subscriptionId} so the webhook handler can verify
 *  - Cache the access token (≤1h) so the webhook handler can fetch message
 *    bodies — when this expires, the agent must call REFRESH_SUBSCRIPTION
 *    to extend lifecycle (which it should anyway because Graph subscriptions
 *    for chat messages max out at ~60 min).
 */

import { createTool } from "@decocms/runtime/tools";
import z from "zod";
import type { Env } from "../types/env.ts";
import { getAccessToken } from "../lib/auth.ts";
import {
  createSubscription,
  deleteSubscription,
  renewSubscription,
} from "../lib/graph-client.ts";
import { getKvStore } from "../lib/kv.ts";
import { toErrorResponse } from "../lib/errors.ts";

interface WebhookConfig {
  clientState: string;
  subscriptions: Record<string, string>; // resource → subscriptionId
  accessToken?: string;
  accessTokenExpiresAt?: number; // epoch ms
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

function configKey(connectionId: string): string {
  return `webhook-config:${connectionId}`;
}

function tokenKey(connectionId: string): string {
  return `webhook-token:${connectionId}`;
}

async function getOrCreateConfig(
  connectionId: string,
  clientStateOverride?: string,
): Promise<WebhookConfig> {
  const kv = getKvStore();
  const existing = await kv.get<WebhookConfig>(configKey(connectionId));
  if (existing) return existing;
  return {
    // clientState is the ONLY verification for the unauthenticated Graph
    // webhook, so it must be cryptographically random and unguessable.
    clientState: clientStateOverride ?? `teams-mcp-${crypto.randomUUID()}`,
    subscriptions: {},
  };
}

async function saveConfig(
  connectionId: string,
  config: WebhookConfig,
): Promise<void> {
  const kv = getKvStore();
  await kv.set(configKey(connectionId), config);
}

async function cacheToken(
  connectionId: string,
  accessToken: string,
): Promise<void> {
  const kv = getKvStore();
  // Conservatively cache for 50 min — webhook handler should refresh before this
  const expiresAt = Date.now() + 50 * 60 * 1000;
  await kv.set<CachedToken>(
    tokenKey(connectionId),
    { accessToken, expiresAt },
    60 * 60 * 1000,
  );
}

function getConnectionId(env: Env): string {
  const id = env.MESH_REQUEST_CONTEXT?.connectionId;
  if (!id) throw new Error("No connectionId in request context");
  return id;
}

function buildNotificationUrl(connectionId: string): string {
  const base =
    process.env.SERVER_PUBLIC_URL ?? `https://graph-mcp.decocms.com`;
  return `${base.replace(/\/$/, "")}/teams/notifications/${connectionId}`;
}

// ─── SUBSCRIBE_TO_CHANNEL ───────────────────────────────────────────────

export const createSubscribeToChannelTool = (env: Env) =>
  createTool({
    id: "SUBSCRIBE_TO_CHANNEL",
    description:
      "Start listening for new messages in a Teams channel — fires the " +
      "'teams.message.received' trigger for each one. Get IDs from LIST_TEAMS " +
      "and LIST_CHANNELS. Subscription expires in ~60 min; call " +
      "REFRESH_SUBSCRIPTIONS every ~50 min to keep it alive, or " +
      "UNSUBSCRIBE_FROM_CHANNEL to stop. Requires SERVER_PUBLIC_URL set.",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z
      .object({
        team_id: z.string().describe("Teams team ID."),
        channel_id: z.string().describe("Teams channel ID."),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      subscription_id: z.string().nullish(),
      expires_at: z.string().nullish(),
      notification_url: z.string().nullish(),
      error: z.string().nullish(),
      error_code: z.string().nullish(),
      error_hint: z.string().nullish(),
      request_id: z.string().nullish(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const { team_id, channel_id } = context as {
        team_id: string;
        channel_id: string;
      };
      try {
        const connectionId = getConnectionId(env);
        const accessToken = getAccessToken(env);
        const config = await getOrCreateConfig(connectionId);
        const resource = `teams/${team_id}/channels/${channel_id}/messages`;
        const notificationUrl = buildNotificationUrl(connectionId);

        const sub = await createSubscription(
          notificationUrl,
          resource,
          config.clientState,
          accessToken,
        );

        config.subscriptions[resource] = sub.id;
        await saveConfig(connectionId, config);
        await cacheToken(connectionId, accessToken);

        return {
          success: true,
          subscription_id: sub.id,
          expires_at: sub.expirationDateTime,
          notification_url: notificationUrl,
        };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

// ─── LIST_SUBSCRIPTIONS ─────────────────────────────────────────────────

export const createListSubscriptionsTool = (env: Env) =>
  createTool({
    id: "LIST_SUBSCRIPTIONS",
    description:
      "List the active Graph subscriptions this MCP has registered for the " +
      "current connection. Returns the resource path, subscription id, and " +
      "the cached access-token expiry (so you know when to refresh).",
    annotations: {
      destructiveHint: false,
      openWorldHint: false,
      readOnlyHint: true,
    },
    inputSchema: z.object({}).strict(),
    outputSchema: z.object({
      success: z.boolean(),
      client_state: z.string().nullish(),
      subscriptions: z
        .array(
          z.object({
            resource: z.string(),
            subscription_id: z.string(),
          }),
        )
        .optional(),
      token_cached_until: z.string().nullish(),
      error: z.string().nullish(),
      error_code: z.string().nullish(),
      error_hint: z.string().nullish(),
      request_id: z.string().nullish(),
    }),
    execute: async () => {
      try {
        const connectionId = getConnectionId(env);
        const kv = getKvStore();
        const config = await kv.get<WebhookConfig>(configKey(connectionId));
        const tokenCache = await kv.get<CachedToken>(tokenKey(connectionId));
        if (!config) {
          return {
            success: true,
            subscriptions: [],
          };
        }
        return {
          success: true,
          client_state: config.clientState,
          subscriptions: Object.entries(config.subscriptions).map(
            ([resource, subscription_id]) => ({ resource, subscription_id }),
          ),
          token_cached_until: tokenCache
            ? new Date(tokenCache.expiresAt).toISOString()
            : null,
        };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

// ─── REFRESH_SUBSCRIPTIONS ──────────────────────────────────────────────

export const createRefreshSubscriptionsTool = (env: Env) =>
  createTool({
    id: "REFRESH_SUBSCRIPTIONS",
    description:
      "Refresh ALL active Graph subscriptions for this connection (extends their " +
      "expiration by ~58 min) and re-cache the access token so the webhook handler " +
      "can keep fetching messages. Call this every ~50 minutes to keep triggers " +
      "alive. Returns the count of refreshed/failed subscriptions.",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: z.object({}).strict(),
    outputSchema: z.object({
      success: z.boolean(),
      refreshed: z.number().nullish(),
      failed: z.number().nullish(),
      error: z.string().nullish(),
      error_code: z.string().nullish(),
      error_hint: z.string().nullish(),
      request_id: z.string().nullish(),
    }),
    execute: async () => {
      try {
        const connectionId = getConnectionId(env);
        const accessToken = getAccessToken(env);
        const kv = getKvStore();
        const config = await kv.get<WebhookConfig>(configKey(connectionId));
        if (!config) {
          return { success: true, refreshed: 0, failed: 0 };
        }

        let refreshed = 0;
        let failed = 0;
        for (const subId of Object.values(config.subscriptions)) {
          try {
            await renewSubscription(subId, accessToken);
            refreshed++;
          } catch {
            failed++;
          }
        }

        await cacheToken(connectionId, accessToken);
        return { success: true, refreshed, failed };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

// ─── UNSUBSCRIBE_FROM_CHANNEL ───────────────────────────────────────────

export const createUnsubscribeFromChannelTool = (env: Env) =>
  createTool({
    id: "UNSUBSCRIBE_FROM_CHANNEL",
    description:
      "Remove a previously-created Graph subscription for a Teams channel. " +
      "Stops the 'teams.message.received' trigger from firing for new messages " +
      "in that channel.",
    annotations: { destructiveHint: true, openWorldHint: true },
    inputSchema: z
      .object({
        team_id: z.string().describe("Teams team ID."),
        channel_id: z.string().describe("Teams channel ID."),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      error: z.string().nullish(),
      error_code: z.string().nullish(),
      error_hint: z.string().nullish(),
      request_id: z.string().nullish(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const { team_id, channel_id } = context as {
        team_id: string;
        channel_id: string;
      };
      try {
        const connectionId = getConnectionId(env);
        const accessToken = getAccessToken(env);
        const kv = getKvStore();
        const config = await kv.get<WebhookConfig>(configKey(connectionId));
        if (!config) return { success: true };

        const resource = `teams/${team_id}/channels/${channel_id}/messages`;
        const subId = config.subscriptions[resource];
        if (!subId) return { success: true };

        try {
          await deleteSubscription(subId, accessToken);
        } catch {
          /* subscription may already be gone server-side; ignore */
        }
        delete config.subscriptions[resource];
        await saveConfig(connectionId, config);
        return { success: true };
      } catch (err) {
        return toErrorResponse(err);
      }
    },
  });

export const subscriptionTools = [
  createSubscribeToChannelTool,
  createListSubscriptionsTool,
  createRefreshSubscriptionsTool,
  createUnsubscribeFromChannelTool,
];
