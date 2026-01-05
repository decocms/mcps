/**
 * Base Connector Interface
 *
 * Defines the contract that all content source connectors must implement.
 * Following the Strategy pattern for extensible source integration.
 *
 * @module connectors/base
 * @version 1.0.0
 */

import type { Source, SourceConfig, SourceType } from "../domain/types.ts";

/**
 * Raw content item as fetched from source, before normalization.
 */
export interface RawContentItem {
  /** Original identifier from source */
  externalId: string;

  /** Title as provided by source */
  title: string;

  /** Raw content/body */
  content: string;

  /** Original URL */
  url: string;

  /** Author if available */
  author?: string;

  /** Publication date if available */
  publishedAt?: string | Date;

  /** Source-specific metadata to preserve */
  metadata?: Record<string, unknown>;
}

/**
 * Result of a fetch operation from a connector.
 */
export interface FetchResult {
  /** Whether the fetch succeeded */
  success: boolean;

  /** Raw items fetched (if successful) */
  items?: RawContentItem[];

  /** Error message (if failed) */
  error?: string;

  /** Additional context about the fetch */
  metadata?: {
    /** Total items available at source (if known) */
    totalAvailable?: number;
    /** Whether there are more items to fetch */
    hasMore?: boolean;
    /** Rate limit info if applicable */
    rateLimit?: {
      remaining: number;
      resetAt: string;
    };
  };
}

/**
 * Options for fetch operations.
 */
export interface FetchOptions {
  /** Maximum items to fetch */
  maxItems?: number;

  /** Only fetch items newer than this date */
  since?: Date;

  /** Pagination cursor (connector-specific) */
  cursor?: string;
}

/**
 * Base interface for all content source connectors.
 *
 * Each connector is responsible for:
 * 1. Fetching raw content from its source
 * 2. Handling authentication/API keys
 * 3. Managing rate limits
 * 4. Returning raw content in a consistent format
 *
 * Normalization to ContentItem is handled by the pipeline,
 * not the connector itself.
 *
 * @example
 * class MyConnector implements Connector<MySourceConfig> {
 *   async fetch(source: Source<MySourceConfig>): Promise<FetchResult> {
 *     // Fetch from source...
 *   }
 * }
 */
export interface Connector<TConfig extends SourceConfig = SourceConfig> {
  /**
   * Unique identifier for this connector type.
   * Must match the SourceType enum value.
   */
  readonly type: SourceType;

  /**
   * Human-readable name for this connector.
   */
  readonly name: string;

  /**
   * Fetch content from the configured source.
   *
   * @param source - The source configuration
   * @param options - Fetch options
   * @returns FetchResult with raw items or error
   */
  fetch(source: Source, options?: FetchOptions): Promise<FetchResult>;

  /**
   * Validate source configuration.
   * Called before fetch to ensure config is valid.
   *
   * @param config - Source configuration to validate
   * @returns true if valid, or error message if invalid
   */
  validateConfig(config: TConfig): true | string;

  /**
   * Optional: Test connectivity to the source.
   * Useful for setup/debugging.
   *
   * @param config - Source configuration
   * @returns true if connected, or error message
   */
  testConnection?(config: TConfig): Promise<true | string>;
}

/**
 * Registry of available connectors.
 * Used by the pipeline to route sources to appropriate connectors.
 */
export type ConnectorRegistry = Map<SourceType, Connector>;

/**
 * Helper to create a connector registry from an array of connectors.
 */
export function createConnectorRegistry(
  connectors: Connector[],
): ConnectorRegistry {
  const registry: ConnectorRegistry = new Map();

  for (const connector of connectors) {
    if (registry.has(connector.type)) {
      console.warn(
        `[ConnectorRegistry] Duplicate connector for type: ${connector.type}`,
      );
    }
    registry.set(connector.type, connector);
  }

  return registry;
}

/**
 * Get connector for a source type from registry.
 * Throws if connector not found.
 */
export function getConnector(
  registry: ConnectorRegistry,
  type: SourceType,
): Connector {
  const connector = registry.get(type);
  if (!connector) {
    throw new Error(`No connector registered for source type: ${type}`);
  }
  return connector;
}
