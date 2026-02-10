#!/usr/bin/env bun
/**
 * Content Scraper MCP - CLI
 *
 * Command-line interface for running scraping tools locally.
 *
 * Usage:
 *   bun cli.ts <command> [options]
 *
 * Environment variables:
 *   DATABASE_API_URL      URL da API do MCP para queries SQL
 *   DATABASE_TOKEN        Token de autenticação Bearer para a API
 *   OPENROUTER_API_KEY    Chave da API OpenRouter (obrigatória para scraping)
 *   APIFY_API_TOKEN       Token da API Apify (obrigatório para LinkedIn)
 */

import { parseArgs } from "util";
import {
  createDatabaseClient,
  type DatabaseClient,
} from "./server/lib/db-client.ts";
import { scrapeAllBlogs } from "./server/lib/blog-scraper.ts";
import {
  scrapeAllLinkedInSources,
  scrapeLinkedInProfile,
} from "./server/lib/linkedin-scraper.ts";
import {
  scrapeAllRedditSources,
  scrapeSubreddit,
} from "./server/lib/reddit-scraper.ts";
import { getCurrentWeek } from "./server/lib/utils.ts";
import type {
  Blog,
  LinkedInSource,
  LinkedInContent,
  RedditSource,
  RedditContent,
} from "./server/types/content.ts";

// =============================================================================
// Help Text
// =============================================================================

const HELP_TEXT = `
📡 Content Scraper MCP - CLI

USAGE:
  bun cli.ts <command> [options]

COMMANDS:
  scrape-all             Executa TODOS os scrapes (blogs + LinkedIn + Reddit)
  scrape-blogs           Executa scraping apenas de blogs
  scrape-linkedin        Executa scraping de LinkedIn (todos ou perfil específico)
  scrape-reddit          Executa scraping de Reddit (todos ou subreddit específico)

  list-blogs             Lista blogs cadastrados
  list-linkedin          Lista perfis LinkedIn cadastrados
  list-reddit            Lista subreddits cadastrados

  articles               Lista artigos salvos
  posts-linkedin         Lista posts do LinkedIn salvos
  posts-reddit           Lista posts do Reddit salvos

  stats                  Exibe estatísticas gerais
  help                   Mostra esta ajuda

OPTIONS:
  --limit <n>            Limite de itens (default: 20)
  --profile <url>        Perfil LinkedIn específico para scraping
  --subreddit <name>     Subreddit específico para scraping (sem 'r/')
  --max-posts <n>        Máximo de posts por perfil LinkedIn (default: 5)
  --help, -h             Mostra esta ajuda

EXAMPLES:
  bun cli.ts scrape-all                              # Roda todos os scrapes
  bun cli.ts scrape-blogs                            # Scrape apenas blogs
  bun cli.ts scrape-linkedin --profile "https://..."  # Scrape perfil específico
  bun cli.ts scrape-reddit --subreddit "mcp"          # Scrape subreddit específico
  bun cli.ts articles --limit 10                      # Lista últimos 10 artigos
  bun cli.ts stats                                    # Exibe estatísticas

ENVIRONMENT:
  DATABASE_API_URL      URL da API do MCP para queries SQL (obrigatória)
  DATABASE_TOKEN        Token de autenticação Bearer (obrigatório)
  OPENROUTER_API_KEY    Chave da API OpenRouter (obrigatória para scraping)
  APIFY_API_TOKEN       Token da API Apify (obrigatório para LinkedIn)
`;

// =============================================================================
// Config
// =============================================================================

interface CliConfig {
  databaseApiUrl: string;
  databaseToken: string;
  openrouterApiKey: string;
  apifyApiToken: string;
}

function loadConfig(): CliConfig {
  return {
    databaseApiUrl: process.env.DATABASE_API_URL ?? "",
    databaseToken: process.env.DATABASE_TOKEN ?? "",
    openrouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
    apifyApiToken: process.env.APIFY_API_TOKEN ?? "",
  };
}

function requireDatabase(config: CliConfig): DatabaseClient {
  if (!config.databaseApiUrl) {
    console.error("❌ DATABASE_API_URL não configurada");
    process.exit(1);
  }
  if (!config.databaseToken) {
    console.error("❌ DATABASE_TOKEN não configurado");
    process.exit(1);
  }
  return createDatabaseClient(config.databaseApiUrl, config.databaseToken);
}

function requireOpenRouter(config: CliConfig): string {
  if (!config.openrouterApiKey) {
    console.error("❌ OPENROUTER_API_KEY não configurada");
    process.exit(1);
  }
  return config.openrouterApiKey;
}

function requireApify(config: CliConfig): string {
  if (!config.apifyApiToken) {
    console.error("❌ APIFY_API_TOKEN não configurado");
    process.exit(1);
  }
  return config.apifyApiToken;
}

// =============================================================================
// Formatters
// =============================================================================

function separator(char = "═", len = 80): string {
  return char.repeat(len);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

// =============================================================================
// Commands
// =============================================================================

async function cmdScrapeAll(
  config: CliConfig,
  args: ParsedArgs,
): Promise<void> {
  const client = requireDatabase(config);
  const apiKey = requireOpenRouter(config);
  const maxPosts = args.values["max-posts"]
    ? Number(args.values["max-posts"])
    : 5;
  const redditLimit = args.values.limit ? Number(args.values.limit) : 10;

  console.log(`\n${separator()}`);
  console.log(" 🚀 RUNNING ALL SCRAPES");
  console.log(separator());

  try {
    // 1. Blogs
    console.log("\n📰 [1/3] Scraping BLOGS...\n");
    try {
      const blogResult = await scrapeAllBlogs(client, apiKey);
      console.log(
        `\n✅ Blogs complete! ${blogResult.totalSaved} articles saved\n`,
      );
    } catch (error) {
      console.error("\n❌ Blogs scrape failed:", error);
    }

    // 2. LinkedIn
    console.log("\n💼 [2/3] Scraping LINKEDIN...\n");
    if (config.apifyApiToken) {
      try {
        const linkedinResults = await scrapeAllLinkedInSources(
          client,
          apiKey,
          config.apifyApiToken,
          maxPosts,
        );
        const totalSaved = linkedinResults.reduce(
          (sum, r) => sum + r.postsSaved,
          0,
        );
        const totalRelevant = linkedinResults.reduce(
          (sum, r) => sum + r.postsRelevant,
          0,
        );
        console.log(
          `\n✅ LinkedIn complete! ${totalSaved} posts saved, ${totalRelevant} relevant\n`,
        );
      } catch (error) {
        console.error("\n❌ LinkedIn scrape failed:", error);
      }
    } else {
      console.log("⚠️  APIFY_API_TOKEN não configurado, pulando LinkedIn\n");
    }

    // 3. Reddit
    console.log("\n🤖 [3/3] Scraping REDDIT...\n");
    try {
      const redditResults = await scrapeAllRedditSources(
        client,
        apiKey,
        redditLimit,
      );
      const totalSaved = redditResults.reduce(
        (sum, r) => sum + r.postsSaved,
        0,
      );
      const totalRelevant = redditResults.reduce(
        (sum, r) => sum + r.postsRelevant,
        0,
      );
      console.log(
        `\n✅ Reddit complete! ${totalSaved} posts saved, ${totalRelevant} relevant\n`,
      );
    } catch (error) {
      console.error("\n❌ Reddit scrape failed:", error);
    }

    console.log(`\n${separator()}`);
    console.log(" ✅ ALL SCRAPES COMPLETE");
    console.log(`${separator()}\n`);
  } finally {
    await client.close();
  }
}

async function cmdScrapeBlogs(config: CliConfig): Promise<void> {
  const client = requireDatabase(config);
  const apiKey = requireOpenRouter(config);

  console.log("\n🚀 Starting blogs scraping...\n");

  try {
    const result = await scrapeAllBlogs(client, apiKey);
    console.log(`\n✅ Complete! ${result.totalSaved} articles saved\n`);
  } finally {
    await client.close();
  }
}

async function cmdScrapeLinkedIn(
  config: CliConfig,
  args: ParsedArgs,
): Promise<void> {
  const client = requireDatabase(config);
  const apiKey = requireOpenRouter(config);
  const apifyToken = requireApify(config);
  const maxPosts = args.values["max-posts"]
    ? Number(args.values["max-posts"])
    : 5;
  const profileUrl = args.values.profile as string | undefined;

  console.log("\n💼 Starting LinkedIn scraping...\n");

  try {
    if (profileUrl) {
      console.log(`  Profile: ${profileUrl}\n`);
      const result = await scrapeLinkedInProfile(
        client,
        apiKey,
        apifyToken,
        profileUrl,
        0.7,
        maxPosts,
      );
      console.log(
        `\n✅ Complete! ${result.postsSaved} posts saved, ${result.postsRelevant} relevant\n`,
      );
    } else {
      const results = await scrapeAllLinkedInSources(
        client,
        apiKey,
        apifyToken,
        maxPosts,
      );
      const totalSaved = results.reduce((sum, r) => sum + r.postsSaved, 0);
      const totalRelevant = results.reduce(
        (sum, r) => sum + r.postsRelevant,
        0,
      );
      console.log(
        `\n✅ Complete! ${totalSaved} posts saved, ${totalRelevant} relevant\n`,
      );
    }
  } finally {
    await client.close();
  }
}

async function cmdScrapeReddit(
  config: CliConfig,
  args: ParsedArgs,
): Promise<void> {
  const client = requireDatabase(config);
  const apiKey = requireOpenRouter(config);
  const limit = args.values.limit ? Number(args.values.limit) : 10;
  const subredditName = args.values.subreddit as string | undefined;

  console.log("\n🤖 Starting Reddit scraping...\n");

  try {
    if (subredditName) {
      console.log(`  Subreddit: r/${subredditName}\n`);
      const result = await scrapeSubreddit(
        client,
        apiKey,
        subredditName,
        0.7,
        "Community",
        limit,
      );
      console.log(
        `\n✅ Complete! ${result.postsSaved} posts saved, ${result.postsRelevant} relevant\n`,
      );
    } else {
      const results = await scrapeAllRedditSources(client, apiKey, limit);
      const totalSaved = results.reduce((sum, r) => sum + r.postsSaved, 0);
      const totalRelevant = results.reduce(
        (sum, r) => sum + r.postsRelevant,
        0,
      );
      console.log(
        `\n✅ Complete! ${totalSaved} posts saved, ${totalRelevant} relevant\n`,
      );
    }
  } finally {
    await client.close();
  }
}

async function cmdListBlogs(config: CliConfig): Promise<void> {
  const client = requireDatabase(config);

  try {
    const result = await client.query(
      `SELECT id, name, url, authority, type FROM blog_sources ORDER BY name ASC`,
    );
    const blogs = result.rows as unknown as Blog[];

    if (blogs.length === 0) {
      console.log("\n📭 Nenhum blog cadastrado.\n");
      return;
    }

    console.log(`\n${separator()}`);
    console.log(" 📰 Blogs Cadastrados");
    console.log(separator());

    for (const blog of blogs) {
      console.log(`\n  ${blog.name}`);
      console.log(`    ID: ${blog.id}`);
      console.log(`    URL: ${blog.url}`);
      console.log(`    Type: ${blog.type}`);
      console.log(`    Authority: ${formatPercent(blog.authority)}`);
    }

    console.log(`\n${separator()}`);
    console.log(` Total: ${blogs.length} blogs`);
    console.log(`${separator()}\n`);
  } finally {
    await client.close();
  }
}

async function cmdListLinkedIn(config: CliConfig): Promise<void> {
  const client = requireDatabase(config);

  try {
    const result = await client.query(
      `SELECT id, name, profile_url, authority, type, active FROM linkedin_sources ORDER BY authority DESC, name ASC`,
    );
    const sources = result.rows as unknown as LinkedInSource[];

    if (sources.length === 0) {
      console.log("\n📭 Nenhum perfil LinkedIn cadastrado.\n");
      return;
    }

    console.log(`\n${separator()}`);
    console.log(" 💼 LinkedIn Sources");
    console.log(separator());

    for (const source of sources) {
      const status = source.active ? "✓" : "○";
      console.log(`\n  ${status} ${source.name}`);
      console.log(`    URL: ${source.profile_url}`);
      console.log(
        `    Type: ${source.type} | Authority: ${formatPercent(source.authority)}`,
      );
    }

    const activeCount = sources.filter((s) => s.active).length;
    console.log(`\n${separator()}`);
    console.log(` Total: ${sources.length} sources (${activeCount} active)`);
    console.log(`${separator()}\n`);
  } finally {
    await client.close();
  }
}

async function cmdListReddit(config: CliConfig): Promise<void> {
  const client = requireDatabase(config);

  try {
    const result = await client.query(
      `SELECT id, name, subreddit, authority, type, active FROM reddit_sources ORDER BY authority DESC, name ASC`,
    );
    const sources = result.rows as unknown as RedditSource[];

    if (sources.length === 0) {
      console.log("\n📭 Nenhum subreddit cadastrado.\n");
      return;
    }

    console.log(`\n${separator()}`);
    console.log(" 🤖 Reddit Sources");
    console.log(separator());

    for (const source of sources) {
      const status = source.active ? "✓" : "○";
      console.log(`\n  ${status} ${source.name}`);
      console.log(`    Subreddit: r/${source.subreddit}`);
      console.log(
        `    Type: ${source.type} | Authority: ${formatPercent(source.authority)}`,
      );
    }

    const activeCount = sources.filter((s) => s.active).length;
    console.log(`\n${separator()}`);
    console.log(` Total: ${sources.length} sources (${activeCount} active)`);
    console.log(`${separator()}\n`);
  } finally {
    await client.close();
  }
}

async function cmdArticles(config: CliConfig, args: ParsedArgs): Promise<void> {
  const client = requireDatabase(config);
  const limit = args.values.limit ? Number(args.values.limit) : 20;

  try {
    const result = await client.query(
      `SELECT a.id, a.article_title as title, a.article_url as url, 
              a.published_at, a.post_score, a.summary,
              b.name as blog_name
       FROM contents a
       JOIN blog_sources b ON a.blog_id = b.id
       ORDER BY a.created_at DESC, a.post_score DESC
       LIMIT ${limit}`,
    );

    interface ArticleRow {
      id: string;
      title: string;
      url: string;
      published_at: string;
      post_score: number;
      summary: string;
      blog_name: string;
    }

    const articles = result.rows as unknown as ArticleRow[];

    if (articles.length === 0) {
      console.log("\n📭 Nenhum artigo salvo.\n");
      return;
    }

    console.log(`\n${separator()}`);
    console.log(` 📰 Artigos (Top ${limit} por data)`);
    console.log(separator());

    for (const article of articles) {
      const scorePercent = formatPercent(article.post_score);
      console.log(`\n  📝 ${truncate(article.title, 70)}`);
      console.log(
        `     Blog: ${article.blog_name} | Score: ${scorePercent} | ${article.published_at}`,
      );
      console.log(`     ${truncate(article.summary || "", 80)}`);
      console.log(`     ${article.url}`);
    }

    console.log(`\n${separator()}`);
    console.log(` Total displayed: ${articles.length} articles`);
    console.log(`${separator()}\n`);
  } finally {
    await client.close();
  }
}

async function cmdPostsLinkedIn(
  config: CliConfig,
  args: ParsedArgs,
): Promise<void> {
  const client = requireDatabase(config);
  const limit = args.values.limit ? Number(args.values.limit) : 20;

  try {
    const result = await client.query(
      `SELECT id, author_name, content, num_likes, num_comments, post_score, week_date
       FROM linkedin_content_scrape
       WHERE post_score > 0
       ORDER BY scraped_at DESC, post_score DESC
       LIMIT ${limit}`,
    );

    const posts = result.rows as unknown as LinkedInContent[];

    if (posts.length === 0) {
      console.log("\n📭 Nenhum post LinkedIn salvo.\n");
      return;
    }

    console.log(`\n${separator()}`);
    console.log(` 💼 LinkedIn Posts (Top ${limit} by score)`);
    console.log(separator());

    for (const post of posts) {
      const scorePercent = formatPercent(post.post_score);
      console.log(`\n  📝 ${post.author_name || "Unknown"}`);
      console.log(
        `     Score: ${scorePercent} | 👍 ${post.num_likes} | 💬 ${post.num_comments} | Week: ${post.week_date || "?"}`,
      );
      console.log(`     ${truncate(post.content || "", 80)}`);
    }

    console.log(`\n${separator()}`);
    console.log(` Total displayed: ${posts.length} posts`);
    console.log(`${separator()}\n`);
  } finally {
    await client.close();
  }
}

async function cmdPostsReddit(
  config: CliConfig,
  args: ParsedArgs,
): Promise<void> {
  const client = requireDatabase(config);
  const limit = args.values.limit ? Number(args.values.limit) : 20;

  try {
    const result = await client.query(
      `SELECT id, title, subreddit, author, score, num_comments, type, post_score, permalink, week_date
       FROM reddit_content_scrape
       WHERE post_score > 0
       ORDER BY scraped_at DESC, post_score DESC
       LIMIT ${limit}`,
    );

    const posts = result.rows as unknown as RedditContent[];

    if (posts.length === 0) {
      console.log("\n📭 Nenhum post Reddit salvo.\n");
      return;
    }

    console.log(`\n${separator()}`);
    console.log(` 🤖 Reddit Posts (Top ${limit} by score)`);
    console.log(separator());

    for (const post of posts) {
      const scorePercent = formatPercent(post.post_score);
      console.log(`\n  📝 ${truncate(post.title, 70)}`);
      console.log(
        `     r/${post.subreddit} | Type: ${post.type} | Score: ${scorePercent} | ⬆️ ${post.score} | 💬 ${post.num_comments}`,
      );
      console.log(`     ${post.permalink}`);
    }

    console.log(`\n${separator()}`);
    console.log(` Total displayed: ${posts.length} posts`);
    console.log(`${separator()}\n`);
  } finally {
    await client.close();
  }
}

async function cmdStats(config: CliConfig): Promise<void> {
  const client = requireDatabase(config);

  try {
    // Blog stats
    const blogStatsResult = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM blog_sources) as total_blogs,
        (SELECT COUNT(*) FROM contents) as total_articles,
        (SELECT COALESCE(AVG(authority), 0) FROM blog_sources) as avg_authority
    `);
    const blogStats = blogStatsResult.rows[0] as {
      total_blogs: number;
      total_articles: number;
      avg_authority: number;
    };

    // LinkedIn stats
    const linkedinSourcesResult = await client.query(
      `SELECT COUNT(*) as total, SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active FROM linkedin_sources`,
    );
    const linkedinSources = linkedinSourcesResult.rows[0] as {
      total: number;
      active: number;
    };

    const linkedinContentResult = await client.query(
      `SELECT COUNT(*) as count FROM linkedin_content_scrape`,
    );
    const linkedinContent = linkedinContentResult.rows[0] as { count: number };

    // Reddit stats
    const redditSourcesResult = await client.query(
      `SELECT COUNT(*) as total, SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active FROM reddit_sources`,
    );
    const redditSources = redditSourcesResult.rows[0] as {
      total: number;
      active: number;
    };

    const redditContentResult = await client.query(
      `SELECT COUNT(*) as count FROM reddit_content_scrape`,
    );
    const redditContent = redditContentResult.rows[0] as { count: number };

    const currentWeek = getCurrentWeek();

    console.log(`\n${separator()}`);
    console.log(` 📊 Content Scraper Stats`);
    console.log(separator());

    console.log(`\n  Current Week: ${currentWeek}`);

    console.log(`\n  📰 Blogs:`);
    console.log(`     Sources: ${Number(blogStats.total_blogs) || 0}`);
    console.log(`     Articles: ${Number(blogStats.total_articles) || 0}`);
    console.log(
      `     Avg Authority: ${formatPercent(Number(blogStats.avg_authority) || 0)}`,
    );

    console.log(`\n  💼 LinkedIn:`);
    console.log(
      `     Sources: ${Number(linkedinSources.total) || 0} (${Number(linkedinSources.active) || 0} active)`,
    );
    console.log(`     Posts: ${Number(linkedinContent.count) || 0}`);

    console.log(`\n  🤖 Reddit:`);
    console.log(
      `     Sources: ${Number(redditSources.total) || 0} (${Number(redditSources.active) || 0} active)`,
    );
    console.log(`     Posts: ${Number(redditContent.count) || 0}`);

    const totalContent =
      (Number(blogStats.total_articles) || 0) +
      (Number(linkedinContent.count) || 0) +
      (Number(redditContent.count) || 0);

    console.log(`\n  📈 Total Content: ${totalContent} items`);

    console.log(`\n${separator()}\n`);
  } finally {
    await client.close();
  }
}

// =============================================================================
// Main
// =============================================================================

interface ParsedArgs {
  values: Record<string, string | boolean | undefined>;
  positionals: string[];
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      help: { type: "boolean", short: "h" },
      limit: { type: "string" },
      profile: { type: "string" },
      subreddit: { type: "string" },
      "max-posts": { type: "string" },
    },
    allowPositionals: true,
  });

  const args: ParsedArgs = { values, positionals };
  const command = positionals[0] || "help";

  if (values.help) {
    console.log(HELP_TEXT);
    return;
  }

  const config = loadConfig();

  switch (command) {
    case "help":
    case "--help":
    case "-h":
      console.log(HELP_TEXT);
      break;

    // Scrape commands
    case "scrape-all":
    case "all":
      await cmdScrapeAll(config, args);
      break;

    case "scrape-blogs":
    case "scrape":
      await cmdScrapeBlogs(config);
      break;

    case "scrape-linkedin":
      await cmdScrapeLinkedIn(config, args);
      break;

    case "scrape-reddit":
      await cmdScrapeReddit(config, args);
      break;

    // List sources commands
    case "list-blogs":
    case "list":
      await cmdListBlogs(config);
      break;

    case "list-linkedin":
      await cmdListLinkedIn(config);
      break;

    case "list-reddit":
      await cmdListReddit(config);
      break;

    // List content commands
    case "articles":
      await cmdArticles(config, args);
      break;

    case "posts-linkedin":
    case "linkedin-posts":
      await cmdPostsLinkedIn(config, args);
      break;

    case "posts-reddit":
    case "reddit-posts":
      await cmdPostsReddit(config, args);
      break;

    // Stats
    case "stats":
      await cmdStats(config);
      break;

    default:
      console.error(`\n❌ Comando desconhecido: ${command}`);
      console.log(HELP_TEXT);
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
