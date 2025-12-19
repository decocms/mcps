/**
 * Registry Sync Module
 *
 * Handles synchronization of MCP apps from the official registry API
 * to the local PostgreSQL database.
 */

import type { Env } from "../main.ts";
import {
  listServers,
  formatServerId,
  type RegistryServer,
} from "./registry-client.ts";
import { upsertApp, type McpAppRecord } from "./postgres.ts";
import { BLACKLISTED_SERVERS } from "./blacklist.ts";

/**
 * Options for sync operation
 */
export interface SyncOptions {
  /** Custom registry URL (optional, defaults to official) */
  registryUrl?: string;
  /** Maximum number of apps to sync (optional, defaults to all) */
  maxApps?: number;
  /** Whether to only sync apps with remotes (default: false) */
  onlyWithRemotes?: boolean;
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  /** Number of apps synced successfully */
  synced: number;
  /** Number of apps skipped (blacklisted, filtered, etc) */
  skipped: number;
  /** Number of errors during sync */
  errors: number;
  /** Total time in milliseconds */
  durationMs: number;
  /** List of error messages if any */
  errorMessages: string[];
}

/**
 * Convert a RegistryServer from API to McpAppRecord for database
 */
function serverToAppRecord(
  server: RegistryServer,
  isOfficial: boolean,
): McpAppRecord {
  const meta = server._meta["io.modelcontextprotocol.registry/official"];
  const serverData = server.server;

  const packages = serverData.packages ?? [];
  const remotes = serverData.remotes ?? [];
  const icons = serverData.icons ?? [];

  return {
    id: formatServerId(serverData.name, serverData.version),
    name: serverData.name,
    version: serverData.version,
    title: serverData.title ?? serverData.name,
    description: serverData.description ?? null,
    schema_url: serverData.$schema ?? null,
    repository_url: serverData.repository?.url ?? null,
    website_url: serverData.websiteUrl ?? null,
    packages,
    remotes,
    icons,
    server_data: serverData,
    meta_data: server._meta,
    has_remotes: Array.isArray(remotes) && remotes.length > 0,
    has_packages: Array.isArray(packages) && packages.length > 0,
    has_icons: Array.isArray(icons) && icons.length > 0,
    has_repository: !!serverData.repository?.url,
    has_website: !!serverData.websiteUrl,
    is_latest: meta?.isLatest ?? false,
    is_official: isOfficial,
    published_at: meta?.publishedAt ?? null,
    updated_at: meta?.updatedAt ?? null,
    synced_at: new Date().toISOString(),
  };
}

/**
 * Check if a server should be skipped based on filters
 */
function shouldSkipServer(
  server: RegistryServer,
  options: SyncOptions,
): boolean {
  const name = server.server.name;

  // Check blacklist
  if (BLACKLISTED_SERVERS.includes(name)) {
    return true;
  }

  // Check excluded words
  const excludedWords = ["local", "test", "demo", "example"];
  if (excludedWords.some((word) => name.toLowerCase().includes(word))) {
    return true;
  }

  // Check remotes filter
  if (options.onlyWithRemotes) {
    const remotes = server.server.remotes;
    if (!remotes || !Array.isArray(remotes) || remotes.length === 0) {
      return true;
    }
  }

  return false;
}

/**
 * Sync all apps from the official registry to the database
 */
export async function syncFromRegistry(
  env: Env,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const startTime = Date.now();
  const result: SyncResult = {
    synced: 0,
    skipped: 0,
    errors: 0,
    durationMs: 0,
    errorMessages: [],
  };

  const { registryUrl, maxApps, onlyWithRemotes = false } = options;
  const isOfficial = !registryUrl;

  let cursor: string | undefined;
  let totalProcessed = 0;

  try {
    do {
      // Fetch a page of servers from the API
      const response = await listServers({
        registryUrl,
        cursor,
        limit: 100, // Fetch in batches of 100
        version: "latest", // Only sync latest versions initially
      });

      // Process each server
      for (const server of response.servers) {
        // Check if we've reached the max
        if (maxApps && totalProcessed >= maxApps) {
          break;
        }

        totalProcessed++;

        // Check if should skip
        if (shouldSkipServer(server, { ...options, onlyWithRemotes })) {
          result.skipped++;
          continue;
        }

        // Convert and upsert to database
        try {
          const appRecord = serverToAppRecord(server, isOfficial);
          await upsertApp(env, appRecord);
          result.synced++;
        } catch (error) {
          result.errors++;
          result.errorMessages.push(
            `Error syncing ${server.server.name}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      // Check if we've reached the max
      if (maxApps && totalProcessed >= maxApps) {
        break;
      }

      // Move to next page
      cursor = response.metadata.nextCursor;
    } while (cursor);
  } catch (error) {
    result.errors++;
    result.errorMessages.push(
      `Fatal sync error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

/**
 * Sync all versions of apps that are already in the database
 * This is useful after an initial sync to get all version history
 */
export async function syncAllVersions(
  _env: Env,
  _options: { registryUrl?: string } = {},
): Promise<SyncResult> {
  const startTime = Date.now();
  const result: SyncResult = {
    synced: 0,
    skipped: 0,
    errors: 0,
    durationMs: 0,
    errorMessages: [],
  };

  // This would require fetching versions for each app
  // For now, this is a placeholder that can be implemented later
  // when we need full version history

  result.durationMs = Date.now() - startTime;
  return result;
}
