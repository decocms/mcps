/**
 * MCP tools for interacting with the Reddit API
 *
 * This file implements tools for:
 * - Fetching posts from a subreddit
 * - Searching Reddit for posts by query
 */
import type { Env } from "../main.ts";
import { createRedditClient } from "./utils/reddit.ts";
import { createPrivateTool } from "@decocms/runtime/mastra";
import {
  getSubredditPostsInputSchema,
  getSubredditPostsOutputSchema,
  searchRedditInputSchema,
  searchRedditOutputSchema,
} from "../lib/types.ts";

/**
 * GET_SUBREDDIT_POSTS - Fetch posts from a specific subreddit
 */
export const createGetSubredditPostsTool = (_env: Env) =>
  createPrivateTool({
    id: "GET_SUBREDDIT_POSTS",
    description:
      "Fetch posts from a Reddit subreddit. You can specify the subreddit name (e.g., 'mcp', 'programming', 'news'), how to sort the posts (hot, new, top, rising), and how many posts to return. Use this to browse and discover content from specific Reddit communities.",
    inputSchema: getSubredditPostsInputSchema,
    outputSchema: getSubredditPostsOutputSchema,
    execute: async ({ context }) => {
      const { subreddit, sort, time, limit, after } = context;

      const client = createRedditClient();

      try {
        const result = await client.getSubredditPosts({
          subreddit,
          sort,
          time,
          limit,
          after,
        });

        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to fetch subreddit posts: ${message}`);
      }
    },
  });

/**
 * SEARCH_REDDIT - Search for posts across Reddit or within a specific subreddit
 */
export const createSearchRedditTool = (_env: Env) =>
  createPrivateTool({
    id: "SEARCH_REDDIT",
    description:
      "Search Reddit for posts matching a query. You can search all of Reddit or limit the search to a specific subreddit. Results can be sorted by relevance, hot, top, new, or number of comments. Use this to find discussions and posts about specific topics.",
    inputSchema: searchRedditInputSchema,
    outputSchema: searchRedditOutputSchema,
    execute: async ({ context }) => {
      const { query, subreddit, sort, time, limit, after } = context;

      const client = createRedditClient();

      try {
        const result = await client.searchReddit({
          query,
          subreddit,
          sort,
          time,
          limit,
          after,
        });

        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to search Reddit: ${message}`);
      }
    },
  });

/**
 * Array of all Reddit tools
 */
export const redditTools = [
  createGetSubredditPostsTool,
  createSearchRedditTool,
];
