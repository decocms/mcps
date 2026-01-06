import { z } from "zod";

/**
 * Reddit Post data structure
 */
export interface RedditPost {
  id: string;
  title: string;
  author: string;
  subreddit: string;
  subreddit_name_prefixed: string;
  selftext: string;
  url: string;
  permalink: string;
  score: number;
  upvote_ratio: number;
  num_comments: number;
  created_utc: number;
  is_self: boolean;
  is_video: boolean;
  thumbnail: string;
  link_flair_text: string | null;
  over_18: boolean;
  spoiler: boolean;
  stickied: boolean;
}

/**
 * Reddit API listing response structure
 */
export interface RedditListingResponse {
  kind: string;
  data: {
    after: string | null;
    before: string | null;
    dist: number;
    modhash: string;
    geo_filter: string;
    children: Array<{
      kind: string;
      data: RedditPost;
    }>;
  };
}

/**
 * Sort options for subreddit posts
 */
export const sortOptions = ["hot", "new", "top", "rising"] as const;
export type SortOption = (typeof sortOptions)[number];

/**
 * Time filter options for top posts
 */
export const timeFilterOptions = [
  "hour",
  "day",
  "week",
  "month",
  "year",
  "all",
] as const;
export type TimeFilterOption = (typeof timeFilterOptions)[number];

/**
 * GET_SUBREDDIT_POSTS input schema
 */
export const getSubredditPostsInputSchema = z.object({
  subreddit: z
    .string()
    .describe(
      "Name of the subreddit to fetch posts from (without the 'r/' prefix). Example: 'mcp', 'programming', 'news'",
    ),
  sort: z
    .enum(sortOptions)
    .optional()
    .default("hot")
    .describe("How to sort the posts: hot, new, top, or rising"),
  time: z
    .enum(timeFilterOptions)
    .optional()
    .describe(
      "Time filter for 'top' sort: hour, day, week, month, year, all. Only used when sort is 'top'",
    ),
  limit: z.coerce
    .number()
    .min(1)
    .max(100)
    .optional()
    .default(25)
    .describe("Number of posts to return (1-100, default: 25)"),
  after: z
    .string()
    .optional()
    .describe("Fullname of a post to fetch posts after (for pagination)"),
});

/**
 * GET_SUBREDDIT_POSTS output schema
 */
export const getSubredditPostsOutputSchema = z.object({
  subreddit: z.string().describe("The subreddit name"),
  sort: z.string().describe("The sort order used"),
  count: z.number().describe("Number of posts returned"),
  after: z.string().nullable().describe("Pagination cursor for next page"),
  posts: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        author: z.string(),
        selftext: z.string().describe("Post body text (empty if link post)"),
        url: z.string().describe("URL of the post or linked content"),
        permalink: z.string().describe("Reddit permalink to the post"),
        score: z.number().describe("Upvotes minus downvotes"),
        num_comments: z.number(),
        created_utc: z.number().describe("Unix timestamp of creation"),
        is_self: z.boolean().describe("True if text post, false if link post"),
        flair: z.string().nullable().describe("Post flair text"),
        nsfw: z.boolean().describe("True if marked NSFW"),
      }),
    )
    .describe("List of posts"),
});

/**
 * SEARCH_REDDIT input schema
 */
export const searchRedditInputSchema = z.object({
  query: z.string().describe("Search query to find posts"),
  subreddit: z
    .string()
    .optional()
    .describe(
      "Limit search to a specific subreddit (without 'r/' prefix). If not provided, searches all of Reddit",
    ),
  sort: z
    .enum(["relevance", "hot", "top", "new", "comments"])
    .optional()
    .default("relevance")
    .describe("How to sort search results"),
  time: z
    .enum(timeFilterOptions)
    .optional()
    .default("all")
    .describe("Time filter: hour, day, week, month, year, all"),
  limit: z.coerce
    .number()
    .min(1)
    .max(100)
    .optional()
    .default(25)
    .describe("Number of results to return (1-100, default: 25)"),
  after: z.string().optional().describe("Pagination cursor"),
});

/**
 * SEARCH_REDDIT output schema
 */
export const searchRedditOutputSchema = z.object({
  query: z.string().describe("The search query used"),
  subreddit: z
    .string()
    .nullable()
    .describe("Subreddit searched (null if all Reddit)"),
  sort: z.string().describe("Sort order used"),
  count: z.number().describe("Number of results returned"),
  after: z.string().nullable().describe("Pagination cursor for next page"),
  posts: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        author: z.string(),
        subreddit: z.string(),
        selftext: z.string(),
        url: z.string(),
        permalink: z.string(),
        score: z.number(),
        num_comments: z.number(),
        created_utc: z.number(),
        is_self: z.boolean(),
        flair: z.string().nullable(),
        nsfw: z.boolean(),
      }),
    )
    .describe("List of matching posts"),
});
