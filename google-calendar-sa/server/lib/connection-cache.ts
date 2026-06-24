/**
 * In-memory cache of SA connection configs.
 *
 * Populated by the `onChange` handler when the platform delivers a
 * connection's state. The scheduler iterates this cache to know which
 * connections to scan for upcoming events.
 *
 * Not persisted — on restart the cache is empty until connections are
 * (re-)loaded by the platform (first MCP request or user config save).
 */

export interface CachedConnection {
  connectionId: string;
  serviceAccountJson: string;
  impersonateEmails: string[];
  leadMinutes: number;
}

const cache = new Map<string, CachedConnection>();

export function cacheConnection(config: CachedConnection): void {
  cache.set(config.connectionId, config);
  console.log(
    `[ConnectionCache] Cached ${config.connectionId} (${config.impersonateEmails.length} emails, lead=${config.leadMinutes}m)`,
  );
}

export function removeConnection(connectionId: string): void {
  cache.delete(connectionId);
}

export function getCachedConnections(): CachedConnection[] {
  return [...cache.values()];
}
