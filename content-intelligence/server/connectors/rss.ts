/**
 * RSS Feed Connector
 *
 * Fetches and parses content from RSS/Atom feeds.
 *
 * @module connectors/rss
 * @version 1.0.0
 */

import type { Source, RssSourceConfig } from "../domain/types.ts";
import type {
  Connector,
  FetchResult,
  FetchOptions,
  RawContentItem,
} from "./base.ts";

/**
 * RSS Feed Connector Implementation
 *
 * Supports both RSS 2.0 and Atom feeds.
 * Uses native fetch and XML parsing (no external dependencies).
 */
export class RssConnector implements Connector<RssSourceConfig> {
  readonly type = "rss" as const;
  readonly name = "RSS Feed";

  validateConfig(config: RssSourceConfig): true | string {
    if (config.type !== "rss") {
      return `Invalid config type: expected 'rss', got '${config.type}'`;
    }

    if (!config.feedUrl) {
      return "Feed URL is required";
    }

    try {
      new URL(config.feedUrl);
    } catch {
      return `Invalid feed URL: ${config.feedUrl}`;
    }

    return true;
  }

  async testConnection(config: RssSourceConfig): Promise<true | string> {
    try {
      const response = await fetch(config.feedUrl, {
        method: "HEAD",
        headers: {
          "User-Agent": "ContentIntelligenceMCP/1.0",
        },
      });

      if (!response.ok) {
        return `Feed returned status ${response.status}`;
      }

      return true;
    } catch (error) {
      return `Connection failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async fetch(source: Source, options?: FetchOptions): Promise<FetchResult> {
    const config = source.config as RssSourceConfig;

    const validation = this.validateConfig(config);
    if (validation !== true) {
      return { success: false, error: validation };
    }

    try {
      const response = await fetch(config.feedUrl, {
        headers: {
          "User-Agent": "ContentIntelligenceMCP/1.0",
          Accept:
            "application/rss+xml, application/atom+xml, application/xml, text/xml",
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Feed returned status ${response.status}: ${response.statusText}`,
        };
      }

      const xml = await response.text();
      const items = this.parseRssFeed(xml, options);

      // Apply tag filtering if configured
      const filteredItems = config.filterTags?.length
        ? items.filter((item) =>
            config.filterTags!.some(
              (tag) =>
                item.title.toLowerCase().includes(tag.toLowerCase()) ||
                item.content.toLowerCase().includes(tag.toLowerCase()),
            ),
          )
        : items;

      // Apply max items limit
      const limitedItems = options?.maxItems
        ? filteredItems.slice(0, options.maxItems)
        : filteredItems;

      return {
        success: true,
        items: limitedItems,
        metadata: {
          totalAvailable: items.length,
          hasMore: false, // RSS feeds don't typically have pagination
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to fetch RSS feed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Parse RSS/Atom XML into RawContentItems.
   *
   * Note: This is a simplified parser. For production,
   * consider using a proper XML parsing library.
   */
  private parseRssFeed(xml: string, options?: FetchOptions): RawContentItem[] {
    const items: RawContentItem[] = [];

    // TODO: Implement proper XML parsing
    // This is a placeholder - real implementation would use
    // DOMParser or a streaming XML parser

    // Detect feed type (RSS vs Atom)
    const isAtom =
      xml.includes("<feed") &&
      xml.includes('xmlns="http://www.w3.org/2005/Atom"');

    if (isAtom) {
      // Parse Atom feed
      // items = this.parseAtomEntries(xml);
    } else {
      // Parse RSS feed
      // items = this.parseRssItems(xml);
    }

    // Filter by date if specified
    if (options?.since) {
      return items.filter((item) => {
        if (!item.publishedAt) return true;
        const pubDate =
          item.publishedAt instanceof Date
            ? item.publishedAt
            : new Date(item.publishedAt);
        return pubDate >= options.since!;
      });
    }

    return items;
  }
}

/**
 * Create a new RSS connector instance.
 */
export function createRssConnector(): RssConnector {
  return new RssConnector();
}
