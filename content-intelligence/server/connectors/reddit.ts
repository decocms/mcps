/**
 * Reddit Connector
 *
 * Fetches content from Reddit subreddits using the public JSON API.
 *
 * @module connectors/reddit
 * @version 1.0.0
 */

import type { Source, RedditSourceConfig } from "../domain/types.ts";
import type {
  Connector,
  FetchResult,
  FetchOptions,
  RawContentItem,
} from "./base.ts";

/**
 * Reddit API response types
 */
interface RedditPost {
  data: {
    id: string;
    title: string;
    selftext: string;
    url: string;
    author: string;
    created_utc: number;
    score: number;
    num_comments: number;
    subreddit: string;
    permalink: string;
    is_self: boolean;
    link_flair_text?: string;
  };
}

interface RedditListing {
  data: {
    children: RedditPost[];
    after: string | null;
    before: string | null;
  };
}

/**
 * Reddit Connector Implementation
 *
 * Uses Reddit's public JSON API (appending .json to URLs).
 * No authentication required for public subreddits.
 *
 * Rate limits: ~60 requests per minute without auth.
 */
export class RedditConnector implements Connector<RedditSourceConfig> {
  readonly type = "reddit" as const;
  readonly name = "Reddit";

  private readonly baseUrl = "https://www.reddit.com";

  validateConfig(config: RedditSourceConfig): true | string {
    if (config.type !== "reddit") {
      return `Invalid config type: expected 'reddit', got '${config.type}'`;
    }

    if (!config.subreddit) {
      return "Subreddit name is required";
    }

    // Basic subreddit name validation
    if (!/^[a-zA-Z0-9_]{2,21}$/.test(config.subreddit)) {
      return `Invalid subreddit name: ${config.subreddit}`;
    }

    return true;
  }

  async testConnection(config: RedditSourceConfig): Promise<true | string> {
    try {
      const url = `${this.baseUrl}/r/${config.subreddit}/about.json`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "ContentIntelligenceMCP/1.0",
        },
      });

      if (response.status === 404) {
        return `Subreddit not found: r/${config.subreddit}`;
      }

      if (response.status === 403) {
        return `Subreddit is private or quarantined: r/${config.subreddit}`;
      }

      if (!response.ok) {
        return `Reddit API returned status ${response.status}`;
      }

      return true;
    } catch (error) {
      return `Connection failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async fetch(source: Source, options?: FetchOptions): Promise<FetchResult> {
    const config = source.config as RedditSourceConfig;

    const validation = this.validateConfig(config);
    if (validation !== true) {
      return { success: false, error: validation };
    }

    try {
      const sortBy = config.sortBy || "hot";
      const timeFilter = config.timeFilter || "week";

      let url = `${this.baseUrl}/r/${config.subreddit}/${sortBy}.json`;

      // Add time filter for "top" sort
      if (sortBy === "top") {
        url += `?t=${timeFilter}`;
      }

      // Add pagination cursor if provided
      if (options?.cursor) {
        url += url.includes("?") ? "&" : "?";
        url += `after=${options.cursor}`;
      }

      // Limit items
      const limit = Math.min(options?.maxItems || 25, 100);
      url += url.includes("?") ? "&" : "?";
      url += `limit=${limit}`;

      const response = await fetch(url, {
        headers: {
          "User-Agent": "ContentIntelligenceMCP/1.0",
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Reddit API returned status ${response.status}`,
        };
      }

      const data = (await response.json()) as RedditListing;
      const items = this.transformPosts(data.data.children, config);

      // Filter by date if specified
      const filteredItems = options?.since
        ? items.filter((item) => {
            if (!item.publishedAt) return true;
            const pubDate = new Date(item.publishedAt);
            return pubDate >= options.since!;
          })
        : items;

      return {
        success: true,
        items: filteredItems,
        metadata: {
          totalAvailable: data.data.children.length,
          hasMore: !!data.data.after,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to fetch from Reddit: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Transform Reddit posts to RawContentItems.
   */
  private transformPosts(
    posts: RedditPost[],
    config: RedditSourceConfig,
  ): RawContentItem[] {
    return posts
      .filter((post) => {
        // Filter by minimum upvotes if configured
        if (config.minUpvotes && post.data.score < config.minUpvotes) {
          return false;
        }
        return true;
      })
      .map((post) => ({
        externalId: post.data.id,
        title: post.data.title,
        content: post.data.selftext || `Link post: ${post.data.url}`,
        url: `https://www.reddit.com${post.data.permalink}`,
        author: post.data.author,
        publishedAt: new Date(post.data.created_utc * 1000).toISOString(),
        metadata: {
          subreddit: post.data.subreddit,
          score: post.data.score,
          numComments: post.data.num_comments,
          isSelfPost: post.data.is_self,
          flair: post.data.link_flair_text,
          originalUrl: post.data.is_self ? undefined : post.data.url,
        },
      }));
  }
}

/**
 * Create a new Reddit connector instance.
 */
export function createRedditConnector(): RedditConnector {
  return new RedditConnector();
}
