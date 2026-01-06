/**
 * HTTP client for interacting with the Reddit Public JSON API.
 *
 * Reddit provides a public JSON API by appending .json to any Reddit URL.
 * No authentication is required for read-only access.
 *
 * Documentation: https://www.reddit.com/dev/api/
 */

import { makeApiRequest } from "@decocms/mcps-shared/tools/utils/api-client";
import type {
  RedditListingResponse,
  RedditPost,
  SortOption,
  TimeFilterOption,
} from "../../lib/types.ts";

const REDDIT_BASE_URL = "https://www.reddit.com";
const USER_AGENT = "deco-mcp-reddit/1.0";

/**
 * Makes a request to the Reddit JSON API
 */
async function makeRedditRequest(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<RedditListingResponse> {
  // Build URL with query parameters
  const url = new URL(`${REDDIT_BASE_URL}${path}.json`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    });
  }

  // Reddit requires a custom User-Agent
  const response = await makeApiRequest(
    url.toString(),
    {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    },
    "Reddit",
  );

  return response as RedditListingResponse;
}

/**
 * Transforms a Reddit API post to our simplified format
 */
function transformPost(data: RedditPost) {
  return {
    id: data.id,
    title: data.title,
    author: data.author,
    subreddit: data.subreddit,
    selftext: data.selftext || "",
    url: data.url,
    permalink: `https://www.reddit.com${data.permalink}`,
    score: data.score,
    num_comments: data.num_comments,
    created_utc: data.created_utc,
    is_self: data.is_self,
    flair: data.link_flair_text,
    nsfw: data.over_18,
  };
}

/**
 * Fetches posts from a subreddit
 */
export async function getSubredditPosts(params: {
  subreddit: string;
  sort?: SortOption;
  time?: TimeFilterOption;
  limit?: number;
  after?: string;
}) {
  const { subreddit, sort = "hot", time, limit = 25, after } = params;

  const path = `/r/${subreddit}/${sort}`;
  const queryParams: Record<string, string | number | undefined> = {
    limit,
    after,
    raw_json: 1, // Prevents HTML encoding in response
  };

  // Time filter only applies to "top" sort
  if (sort === "top" && time) {
    queryParams.t = time;
  }

  const response = await makeRedditRequest(path, queryParams);

  return {
    subreddit,
    sort,
    count: response.data.children.length,
    after: response.data.after,
    posts: response.data.children.map((child) => transformPost(child.data)),
  };
}

/**
 * Searches Reddit for posts matching a query
 */
export async function searchReddit(params: {
  query: string;
  subreddit?: string;
  sort?: "relevance" | "hot" | "top" | "new" | "comments";
  time?: TimeFilterOption;
  limit?: number;
  after?: string;
}) {
  const {
    query,
    subreddit,
    sort = "relevance",
    time = "all",
    limit = 25,
    after,
  } = params;

  // If subreddit is specified, search within it, otherwise search all Reddit
  const path = subreddit ? `/r/${subreddit}/search` : "/search";

  const queryParams: Record<string, string | number | undefined> = {
    q: query,
    sort,
    t: time,
    limit,
    after,
    raw_json: 1,
    type: "link", // Only search posts, not subreddits or users
  };

  // If searching within a subreddit, restrict to that subreddit
  if (subreddit) {
    queryParams.restrict_sr = "on";
  }

  const response = await makeRedditRequest(path, queryParams);

  return {
    query,
    subreddit: subreddit || null,
    sort,
    count: response.data.children.length,
    after: response.data.after,
    posts: response.data.children.map((child) => transformPost(child.data)),
  };
}

/**
 * Creates a Reddit client with all available methods
 */
export function createRedditClient() {
  return {
    getSubredditPosts,
    searchReddit,
  };
}
