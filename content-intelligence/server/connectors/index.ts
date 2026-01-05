/**
 * Content Source Connectors
 *
 * This module exports all available connectors for content ingestion.
 * Each connector implements the Connector interface and handles
 * fetching from a specific source type.
 *
 * @module connectors
 * @version 1.0.0
 */

// Base types and utilities
export type {
  Connector,
  ConnectorRegistry,
  FetchResult,
  FetchOptions,
  RawContentItem,
} from "./base.ts";

export { createConnectorRegistry, getConnector } from "./base.ts";

// Connector implementations
export { RssConnector, createRssConnector } from "./rss.ts";
export { RedditConnector, createRedditConnector } from "./reddit.ts";
export {
  WebScraperConnector,
  createWebScraperConnector,
} from "./web-scraper.ts";

/**
 * Create the default connector registry with all available connectors.
 */
import { createConnectorRegistry } from "./base.ts";
import { createRssConnector } from "./rss.ts";
import { createRedditConnector } from "./reddit.ts";
import { createWebScraperConnector } from "./web-scraper.ts";

export function createDefaultConnectorRegistry() {
  return createConnectorRegistry([
    createRssConnector(),
    createRedditConnector(),
    createWebScraperConnector(),
  ]);
}
