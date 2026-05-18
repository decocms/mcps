/**
 * Per-connection configuration cache.
 *
 * Stores Teams/Azure credentials keyed by connectionId so the webhook
 * handler can look up credentials without hitting the Mesh config endpoint
 * on every notification.
 */

import { getKvStore } from "./kv.ts";

const PREFIX = "conn:";

export interface ConnectionConfig {
  connectionId: string;
  organizationId: string;
  meshUrl: string;
  meshToken?: string;
  meshApiKey?: string;
  agentId?: string;
  // Azure credentials
  tenantId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  // Delegated OAuth tokens (filled after /auth/callback)
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
  userPrincipalName?: string;
  userDisplayName?: string;
  // Notification validation
  clientState: string;
  // Optional overrides
  defaultTeamId?: string;
  defaultChannelId?: string;
  connectionName?: string;
  // Subscription tracking: channelKey → subscriptionId
  subscriptions?: Record<string, string>;
  configuredAt?: string;
  responseConfig?: {
    triggerOnly?: boolean;
  };
}

export async function cacheConnectionConfig(
  config: ConnectionConfig,
): Promise<void> {
  const kv = getKvStore();
  await kv.set<ConnectionConfig>(`${PREFIX}${config.connectionId}`, {
    ...config,
    configuredAt: new Date().toISOString(),
  });
}

export async function getCachedConnectionConfig(
  connectionId: string,
): Promise<ConnectionConfig | null> {
  const kv = getKvStore();
  return kv.get<ConnectionConfig>(`${PREFIX}${connectionId}`);
}

export async function updateSubscriptions(
  connectionId: string,
  subscriptions: Record<string, string>,
): Promise<void> {
  const existing = await getCachedConnectionConfig(connectionId);
  if (!existing) return;
  await cacheConnectionConfig({ ...existing, subscriptions });
}
