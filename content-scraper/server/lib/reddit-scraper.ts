/**
 * Reddit Scraper
 *
 * Scraping system for Reddit posts.
 */

import type {
  RedditRawPost,
  RedditContentInsert,
  RedditSource,
  RedditContentType,
  SourceType,
  ScrapeResult,
} from "../types/content.ts";
import type { DatabaseClient } from "./db-client.ts";
import { analyzeRedditPost } from "./llm.ts";
import { sleep, generateContentHash, getPublicationWeek } from "./utils.ts";

// Rate limiting
const DELAY_BETWEEN_POSTS = 300;
const DELAY_BETWEEN_SUBREDDITS = 2000;

interface RedditScraperContext {
  dbClient: DatabaseClient;
  openrouterApiKey: string;
}

/**
 * Convert SourceType to RedditContentType
 */
function sourceTypeToRedditType(type: SourceType): RedditContentType {
  switch (type) {
    case "Trendsetter":
      return "Trendsetters";
    case "Enterprise":
      return "Enterprise";
    case "MCP-First Startups":
      return "MCP-First Startups";
    case "Community":
    default:
      return "Community";
  }
}

/**
 * List active Reddit sources from database
 */
async function listRedditSources(
  client: DatabaseClient,
  activeOnly = true,
): Promise<RedditSource[]> {
  const whereClause = activeOnly ? "WHERE active = 1" : "";
  const result = await client.query(
    `SELECT id, name, subreddit, authority, type, active, created_at 
     FROM reddit_sources 
     ${whereClause}
     ORDER BY authority DESC, name ASC`,
  );
  return (result.rows as unknown as RedditSource[]).map((source) => ({
    ...source,
    active: Boolean(source.active),
  }));
}

/**
 * Check if post exists by permalink
 */
async function redditContentExistsByPermalink(
  client: DatabaseClient,
  permalink: string,
): Promise<boolean> {
  const result = await client.queryParams(
    "SELECT COUNT(*) as count FROM reddit_content_scrape WHERE permalink = ?",
    [permalink],
  );
  return Number((result.rows[0] as { count: number }).count) > 0;
}

/**
 * Check if content exists by hash
 */
async function redditContentExistsByHash(
  client: DatabaseClient,
  contentHash: string,
): Promise<boolean> {
  const result = await client.queryParams(
    "SELECT COUNT(*) as count FROM reddit_content_scrape WHERE content_hash = ?",
    [contentHash],
  );
  return Number((result.rows[0] as { count: number }).count) > 0;
}

/**
 * Create Reddit content
 */
async function createRedditContent(
  client: DatabaseClient,
  input: RedditContentInsert,
): Promise<void> {
  await client.queryParams(
    `INSERT INTO reddit_content_scrape (
      title, author, subreddit, selftext, url, permalink,
      score, num_comments, created_at, type, authority, post_score, week_date, content_hash
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.title,
      input.author,
      input.subreddit,
      input.selftext,
      input.url,
      input.permalink,
      input.score,
      input.num_comments,
      input.created_at,
      input.type,
      input.authority,
      input.post_score,
      input.week_date,
      input.content_hash ?? null,
    ],
  );
}

/**
 * Fetch posts from subreddit via public Reddit API
 */
async function fetchSubredditPosts(
  subreddit: string,
  limit = 10,
  sort: "hot" | "new" | "top" = "hot",
): Promise<RedditRawPost[]> {
  const url = `https://www.reddit.com/r/${subreddit}/${sort}.json?limit=${limit}`;

  console.log(`[Reddit] Fetching from: ${url}`);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "ContentScraper/1.0 (by /u/content-scraper)",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Reddit API error: ${response.status} - ${response.statusText}`,
    );
  }

  const data = (await response.json()) as {
    data?: { children?: Array<{ data: Record<string, unknown> }> };
  };

  if (!data.data?.children) {
    return [];
  }

  return data.data.children.map((child) => {
    const post = child.data;
    return {
      id: post.id,
      title: post.title,
      author: post.author,
      subreddit: post.subreddit,
      selftext: post.selftext || "",
      url: post.url,
      permalink: `https://reddit.com${post.permalink}`,
      score: post.score,
      num_comments: post.num_comments,
      created_utc: post.created_utc,
      is_self: post.is_self,
      flair: post.link_flair_text || null,
      nsfw: post.over_18,
    } as RedditRawPost;
  });
}

/**
 * Process Reddit posts
 */
async function processRedditPosts(
  ctx: RedditScraperContext,
  posts: RedditRawPost[],
  type: RedditContentType,
  authority: number,
): Promise<{
  postsSaved: number;
  postsRelevant: number;
  postsSkipped: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let postsSaved = 0;
  let postsRelevant = 0;
  let postsSkipped = 0;

  console.log(`[Reddit] Processing ${posts.length} posts (type: ${type})`);

  for (const post of posts) {
    try {
      // Check if exists by permalink
      const existsByPermalink = await redditContentExistsByPermalink(
        ctx.dbClient,
        post.permalink,
      );
      if (existsByPermalink) {
        console.log(
          `    → Skipping (already exists): ${post.title.slice(0, 40)}...`,
        );
        postsSkipped++;
        continue;
      }

      // Generate content hash
      const content = post.selftext || post.title;
      const contentHash = generateContentHash(post.title + " " + content);

      // Check for duplicate content
      const existsByHash = await redditContentExistsByHash(
        ctx.dbClient,
        contentHash,
      );
      if (existsByHash) {
        console.log(
          `    → Skipping (cross-post detected): ${post.title.slice(0, 40)}...`,
        );
        postsSkipped++;
        continue;
      }

      // Analyze with LLM
      const analysis = await analyzeRedditPost(
        post.title,
        content,
        post.subreddit,
        { upvotes: post.score, comments: post.num_comments },
        ctx.openrouterApiKey,
      );

      // Skip if not relevant
      if (!analysis.is_relevant) {
        console.log(
          `    → Skipping (not relevant): ${post.title.slice(0, 40)}...`,
        );
        postsSkipped++;
        continue;
      }

      postsRelevant++;

      const postScore = analysis.quality_score;

      // Prepare insert data
      const insertData: RedditContentInsert = {
        title: post.title,
        author: post.author,
        subreddit: post.subreddit,
        selftext: post.selftext || null,
        url: post.url,
        permalink: post.permalink,
        score: post.score,
        num_comments: post.num_comments,
        created_at: post.created_utc,
        type: type,
        authority: authority,
        post_score: postScore,
        week_date: getPublicationWeek(new Date(post.created_utc * 1000)),
        content_hash: contentHash,
      };

      // Save to database
      await createRedditContent(ctx.dbClient, insertData);
      postsSaved++;
      console.log(
        `    ✓ Saved (score: ${(postScore * 100).toFixed(0)}%): ${post.title.slice(0, 40)}...`,
      );

      await sleep(DELAY_BETWEEN_POSTS);
    } catch (error) {
      const errorMsg = `Error processing post ${post.id}: ${error}`;
      console.error(`    ✗ ${errorMsg}`);
      errors.push(errorMsg);
    }
  }

  console.log(
    `[Reddit] Finished: ${postsSaved} saved, ${postsRelevant} relevant, ${postsSkipped} skipped`,
  );

  return {
    postsSaved,
    postsRelevant,
    postsSkipped,
    errors,
  };
}

/**
 * Scrape a single subreddit
 */
export async function scrapeSubreddit(
  dbClient: DatabaseClient,
  openrouterApiKey: string,
  subreddit: string,
  authority = 0.7,
  type: RedditContentType = "Community",
  limit = 10,
): Promise<ScrapeResult> {
  console.log(`[Reddit] Scraping r/${subreddit}`);
  console.log(`    Authority: ${(authority * 100).toFixed(0)}%, Type: ${type}`);

  const ctx: RedditScraperContext = { dbClient, openrouterApiKey };

  try {
    const posts = await fetchSubredditPosts(subreddit, limit, "hot");

    if (posts.length === 0) {
      console.log("    ⚠ No posts found");
      return {
        subreddit,
        postsFound: 0,
        postsSaved: 0,
        postsRelevant: 0,
        postsSkipped: 0,
        errors: [],
      };
    }

    console.log(`    Found ${posts.length} posts`);

    const result = await processRedditPosts(ctx, posts, type, authority);

    return {
      subreddit,
      postsFound: posts.length,
      postsSaved: result.postsSaved,
      postsRelevant: result.postsRelevant,
      postsSkipped: result.postsSkipped,
      errors: result.errors,
    };
  } catch (error) {
    console.error(`    ✗ Error: ${error}`);
    return {
      subreddit,
      postsFound: 0,
      postsSaved: 0,
      postsRelevant: 0,
      postsSkipped: 0,
      errors: [String(error)],
    };
  }
}

/**
 * Scrape all Reddit sources from database
 */
export async function scrapeAllRedditSources(
  dbClient: DatabaseClient,
  openrouterApiKey: string,
  limit = 10,
): Promise<ScrapeResult[]> {
  console.log("=".repeat(60));
  console.log("Reddit Scraper - Scraping All Sources");
  console.log("=".repeat(60));

  const sources = await listRedditSources(dbClient, true);

  if (sources.length === 0) {
    console.log("\n⚠ No active Reddit sources found in database.");
    return [];
  }

  console.log(`\nFound ${sources.length} active Reddit sources\n`);

  const results: ScrapeResult[] = [];

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    console.log(
      `\n[${i + 1}/${sources.length}] Processing: r/${source.subreddit}`,
    );

    const result = await scrapeSubreddit(
      dbClient,
      openrouterApiKey,
      source.subreddit,
      source.authority,
      sourceTypeToRedditType(source.type),
      limit,
    );
    results.push(result);

    console.log(
      `    ✓ Done: ${result.postsSaved} saved, ${result.postsRelevant} relevant`,
    );

    if (i < sources.length - 1) {
      await sleep(DELAY_BETWEEN_SUBREDDITS);
    }
  }

  const totalSaved = results.reduce((sum, r) => sum + r.postsSaved, 0);
  const totalRelevant = results.reduce((sum, r) => sum + r.postsRelevant, 0);

  console.log("\n" + "=".repeat(60));
  console.log(
    `Scraping complete! Total: ${totalSaved} posts saved, ${totalRelevant} relevant`,
  );
  console.log("=".repeat(60));

  return results;
}
