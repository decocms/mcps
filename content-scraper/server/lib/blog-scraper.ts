/**
 * Blog Scraper
 *
 * Scraping system for blog content.
 */

import type { Blog, ArticleInsert } from "../types/content.ts";
import type { DatabaseClient } from "./db-client.ts";
import { extractArticlesFromPage, analyzeArticle } from "./llm.ts";
import {
  extractTextWithLinks,
  extractPlainText,
  fetchWithRetry,
  sleep,
  hasMinimumContent,
  isWithinLastWeek,
  formatDate,
  getPublicationWeek,
  calculatePostScore,
  parseDate,
} from "./utils.ts";

// Rate limiting
const DELAY_BETWEEN_BLOGS = 2000;
const DELAY_BETWEEN_ARTICLES = 500;

interface ScrapeBlogContext {
  dbClient: DatabaseClient;
  openrouterApiKey: string;
}

/**
 * List all blogs from database
 */
async function listBlogs(client: DatabaseClient): Promise<Blog[]> {
  const result = await client.query(
    `SELECT id, name, url, feed_url, authority, type, created_at 
     FROM blog_sources 
     ORDER BY name ASC`,
  );
  return result.rows as unknown as Blog[];
}

/**
 * Check if article already exists by URL
 */
async function articleExistsByUrl(
  client: DatabaseClient,
  url: string,
): Promise<boolean> {
  const result = await client.queryParams(
    "SELECT COUNT(*) as count FROM contents WHERE article_url = ?",
    [url],
  );
  return Number((result.rows[0] as { count: number }).count) > 0;
}

/**
 * Upsert article to database
 */
async function upsertArticle(
  client: DatabaseClient,
  input: ArticleInsert,
): Promise<void> {
  const now = new Date().toISOString();
  const keyPointsJson = JSON.stringify(input.key_points);

  await client.queryParams(
    `INSERT INTO contents (blog_id, article_title, article_url, published_at, publication_week, summary, key_points, post_score, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (article_url) DO UPDATE SET
      article_title = EXCLUDED.article_title,
      summary = EXCLUDED.summary,
      key_points = EXCLUDED.key_points,
      post_score = EXCLUDED.post_score,
      updated_at = datetime('now')`,
    [
      input.blog_id,
      input.title,
      input.url,
      input.published_at,
      input.publication_week,
      input.summary,
      keyPointsJson,
      input.post_score,
      now,
    ],
  );
}

/**
 * Process a single article
 */
async function processArticle(
  ctx: ScrapeBlogContext,
  blog: Blog,
  articleInfo: { title: string; url: string; published_at: string | null },
): Promise<boolean> {
  // Check if already exists
  const exists = await articleExistsByUrl(ctx.dbClient, articleInfo.url);
  if (exists) {
    console.log(
      `    → Skipping (already exists): ${articleInfo.title.slice(0, 40)}...`,
    );
    return false;
  }

  // Fetch article content
  const response = await fetchWithRetry(articleInfo.url);
  if (!response.ok) {
    throw new Error(`Failed to fetch article: ${response.status}`);
  }

  const html = await response.text();
  const content = extractPlainText(html);

  // Validate minimum content
  if (!hasMinimumContent(content)) {
    console.log(
      `    → Skipping (content too short): ${articleInfo.title.slice(0, 40)}...`,
    );
    return false;
  }

  // Analyze with LLM
  const analysis = await analyzeArticle(
    articleInfo.title,
    content,
    blog.authority,
    ctx.openrouterApiKey,
  );

  // Filter MCP-related only
  if (!analysis.is_mcp_related) {
    console.log(
      `    → Skipping (not MCP-related): ${articleInfo.title.slice(0, 40)}...`,
    );
    return false;
  }

  // Determine publication date
  let publishedDate: Date;
  if (articleInfo.published_at) {
    const parsed = parseDate(articleInfo.published_at);
    publishedDate = parsed || new Date();
  } else {
    publishedDate = new Date();
  }

  // Filter by date (last week)
  if (!isWithinLastWeek(publishedDate)) {
    console.log(
      `    → Skipping (older than 1 week): ${articleInfo.title.slice(0, 40)}...`,
    );
    return false;
  }

  // Calculate post_score
  const postScore = calculatePostScore(analysis.quality_score, blog.authority);

  // Save to database
  await upsertArticle(ctx.dbClient, {
    blog_id: blog.id,
    title: articleInfo.title,
    url: articleInfo.url,
    published_at: formatDate(publishedDate),
    publication_week: getPublicationWeek(publishedDate),
    summary: analysis.summary,
    key_points: analysis.key_points,
    post_score: postScore,
  });

  return true;
}

/**
 * Scrape a single blog
 */
async function scrapeBlog(ctx: ScrapeBlogContext, blog: Blog): Promise<number> {
  // Fetch main page
  const response = await fetchWithRetry(blog.url);
  if (!response.ok) {
    throw new Error(`Failed to fetch blog page: ${response.status}`);
  }

  const html = await response.text();
  const pageContent = extractTextWithLinks(html, blog.url);

  if (!hasMinimumContent(pageContent, 200)) {
    console.log("    ⚠ Page content too short, skipping");
    return 0;
  }

  // Use LLM to extract articles
  const { articles: articleList } = await extractArticlesFromPage(
    pageContent,
    blog.name,
    ctx.openrouterApiKey,
  );

  if (articleList.length === 0) {
    console.log("    ⚠ No articles found");
    return 0;
  }

  console.log(`    Found ${articleList.length} article links`);

  // Process each article
  let savedCount = 0;

  for (const articleInfo of articleList) {
    try {
      const saved = await processArticle(ctx, blog, articleInfo);
      if (saved) {
        savedCount++;
        console.log(
          `    ✓ Saved/Updated: ${articleInfo.title.slice(0, 40)}...`,
        );
      }
    } catch (error) {
      console.error(`    ✗ Error processing "${articleInfo.title}": ${error}`);
    }

    await sleep(DELAY_BETWEEN_ARTICLES);
  }

  return savedCount;
}

/**
 * Scrape all blogs
 */
export async function scrapeAllBlogs(
  dbClient: DatabaseClient,
  openrouterApiKey: string,
): Promise<{ success: boolean; totalSaved: number; message: string }> {
  console.log("=".repeat(60));
  console.log("Blog Scraper MCP - Starting scraping process");
  console.log("=".repeat(60));

  const ctx: ScrapeBlogContext = { dbClient, openrouterApiKey };

  const blogs = await listBlogs(dbClient);
  console.log(`\nFound ${blogs.length} blogs to scrape\n`);

  if (blogs.length === 0) {
    return {
      success: true,
      totalSaved: 0,
      message: "No blogs found in database",
    };
  }

  let totalArticlesSaved = 0;

  for (let i = 0; i < blogs.length; i++) {
    const blog = blogs[i];
    console.log(`\n[${i + 1}/${blogs.length}] Processing: ${blog.name}`);
    console.log(`    URL: ${blog.url}`);
    console.log(`    Authority: ${(blog.authority * 100).toFixed(0)}%`);

    try {
      const savedCount = await scrapeBlog(ctx, blog);
      totalArticlesSaved += savedCount;
      console.log(`    ✓ Saved ${savedCount} new articles`);
    } catch (error) {
      console.error(`    ✗ Error: ${error}`);
    }

    if (i < blogs.length - 1) {
      await sleep(DELAY_BETWEEN_BLOGS);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Scraping complete! Total articles saved: ${totalArticlesSaved}`);
  console.log("=".repeat(60));

  return {
    success: true,
    totalSaved: totalArticlesSaved,
    message: `Scraped ${blogs.length} blogs, saved ${totalArticlesSaved} articles`,
  };
}
