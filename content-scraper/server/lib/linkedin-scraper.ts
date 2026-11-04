/**
 * LinkedIn Scraper
 *
 * Scraping system for LinkedIn posts using Apify API.
 */

import type {
  LinkedInRawPost,
  LinkedInContentInsert,
  LinkedInSource,
  ScrapeResult,
} from "../types/content.ts";
import type { DatabaseClient } from "./db-client.ts";
import { analyzeLinkedInPost } from "./llm.ts";
import { getPublicationWeek, sleep, generateContentHash } from "./utils.ts";

// Apify API configuration
const APIFY_API_URL = "https://api.apify.com/v2";
const LINKEDIN_ACTOR_ID = "harvestapi~linkedin-profile-posts";
const JOHNVC_LINKEDIN_ACTOR_ID = "johnvc~linkedin-posts-api";

/** Opt-in Actor choice. Default stays harvestapi. */
export type LinkedInActorChoice = "harvestapi" | "johnvc";

// Rate limiting
const DELAY_BETWEEN_POSTS = 300;
const MIN_RELEVANT_SCORE = 0.5;

interface LinkedInScraperContext {
  dbClient: DatabaseClient;
  openrouterApiKey: string;
  apifyApiToken: string;
}

/**
 * List active LinkedIn sources from database
 */
async function listLinkedInSources(
  client: DatabaseClient,
  activeOnly = true,
): Promise<LinkedInSource[]> {
  const whereClause = activeOnly ? "WHERE active = 1" : "";
  const result = await client.query(
    `SELECT id, name, profile_url, authority, type, active, created_at 
     FROM linkedin_sources 
     ${whereClause}
     ORDER BY authority DESC, name ASC`,
  );
  return (result.rows as unknown as LinkedInSource[]).map((source) => ({
    ...source,
    active: Boolean(source.active),
  }));
}

/**
 * Check if post exists by post_id
 */
async function linkedInContentExistsByPostId(
  client: DatabaseClient,
  postId: string,
): Promise<boolean> {
  const result = await client.queryParams(
    "SELECT COUNT(*) as count FROM linkedin_content_scrape WHERE post_id = ?",
    [postId],
  );
  return Number((result.rows[0] as { count: number }).count) > 0;
}

/**
 * Check if content exists by hash
 */
async function linkedInContentExistsByHash(
  client: DatabaseClient,
  contentHash: string,
): Promise<boolean> {
  const result = await client.queryParams(
    "SELECT COUNT(*) as count FROM linkedin_content_scrape WHERE content_hash = ?",
    [contentHash],
  );
  return Number((result.rows[0] as { count: number }).count) > 0;
}

/**
 * Create LinkedIn content
 */
async function createLinkedInContent(
  client: DatabaseClient,
  input: LinkedInContentInsert,
): Promise<void> {
  const now = new Date().toISOString();

  await client.queryParams(
    `INSERT INTO linkedin_content_scrape (
      post_id, url, author_name, author_headline, author_profile_url, author_profile_image,
      content, num_likes, num_comments, num_reposts, post_type, media_url, published_at,
      scraped_at, post_score, type, week_date, content_hash
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.post_id,
      input.url,
      input.author_name,
      input.author_headline,
      input.author_profile_url,
      input.author_profile_image,
      input.content,
      input.num_likes,
      input.num_comments,
      input.num_reposts,
      input.post_type,
      input.media_url,
      input.published_at,
      now,
      input.post_score,
      input.type,
      input.week_date,
      input.content_hash ?? null,
    ],
  );
}

/**
 * Start an Apify Actor run, poll until SUCCEEDED, and return dataset items.
 */
async function runApifyActorAndFetchItems(
  actorId: string,
  input: Record<string, unknown>,
  apifyToken: string,
): Promise<unknown[]> {
  const runResponse = await fetch(
    `${APIFY_API_URL}/acts/${actorId}/runs?token=${apifyToken}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );

  if (!runResponse.ok) {
    const errorText = await runResponse.text();
    throw new Error(`Apify API error: ${runResponse.status} - ${errorText}`);
  }

  const runData = (await runResponse.json()) as { data: { id: string } };
  const runId = runData.data.id;

  console.log(`[LinkedIn] Started Apify run: ${runId} (${actorId})`);

  let status = "RUNNING";
  let attempts = 0;
  const maxAttempts = 60;

  while (status === "RUNNING" && attempts < maxAttempts) {
    await sleep(2000);
    attempts++;

    const statusResponse = await fetch(
      `${APIFY_API_URL}/actor-runs/${runId}?token=${apifyToken}`,
    );

    if (!statusResponse.ok) {
      throw new Error(`Failed to check run status: ${statusResponse.status}`);
    }

    const statusData = (await statusResponse.json()) as {
      data: { status: string };
    };
    status = statusData.data.status;

    if (attempts % 5 === 0) {
      console.log(`[LinkedIn] Run status: ${status} (attempt ${attempts})`);
    }
  }

  if (status !== "SUCCEEDED") {
    throw new Error(`Apify run failed with status: ${status}`);
  }

  const datasetResponse = await fetch(
    `${APIFY_API_URL}/actor-runs/${runId}/dataset/items?token=${apifyToken}`,
  );

  if (!datasetResponse.ok) {
    throw new Error(`Failed to fetch dataset: ${datasetResponse.status}`);
  }

  const posts = await datasetResponse.json();
  return posts as unknown[];
}

/**
 * Public identifier from a LinkedIn profile URL path segment.
 */
function publicIdentifierFromUrl(url: string | undefined): string {
  if (!url || typeof url !== "string") return "";
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p === "in" || p === "company");
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    return parts[0] ?? "";
  } catch {
    return "";
  }
}

/**
 * Map a johnvc/linkedin-posts-api row onto LinkedInRawPost so processLinkedInPost
 * stays unchanged. Share counts are 0 (Actor does not return them). Avatar unset.
 */
export function mapJohnvcPostToRaw(
  row: Record<string, unknown>,
): LinkedInRawPost | null {
  const resultType = row.resultType ?? row.result_type;
  if (resultType && resultType !== "post") return null;

  const postId = String(row.postId ?? row.id ?? "");
  if (!postId) return null;

  const datePosted =
    typeof row.datePosted === "string"
      ? row.datePosted
      : typeof row.fetchedAt === "string"
        ? row.fetchedAt
        : new Date().toISOString();
  const timestamp = Date.parse(datePosted);
  const authorUrl =
    typeof row.authorUrl === "string" ? row.authorUrl : undefined;
  const authorName = typeof row.authorName === "string" ? row.authorName : "";

  const images = Array.isArray(row.images)
    ? (row.images as unknown[])
        .map((img) => {
          if (typeof img === "string") return { url: img };
          if (img && typeof img === "object" && "url" in img) {
            return { url: String((img as { url: unknown }).url) };
          }
          return null;
        })
        .filter((x): x is { url: string } => x !== null)
    : undefined;

  const raw: LinkedInRawPost = {
    type: typeof row.postType === "string" ? row.postType : "post",
    id: postId,
    linkedinUrl: String(row.postUrl ?? row.linkedinUrl ?? ""),
    content: String(row.text ?? row.content ?? ""),
    author: {
      name: authorName,
      publicIdentifier: publicIdentifierFromUrl(authorUrl),
      linkedinUrl: authorUrl ?? "",
      info:
        typeof row.authorHeadline === "string" ? row.authorHeadline : undefined,
    },
    postedAt: {
      timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
      date: datePosted,
    },
    engagement: {
      likes: typeof row.numLikes === "number" ? row.numLikes : 0,
      comments: typeof row.numComments === "number" ? row.numComments : 0,
      shares: 0,
    },
  };
  if (images && images.length > 0) raw.postImages = images;
  return raw;
}

/**
 * Fetch LinkedIn posts via the default HarvestAPI Actor.
 */
async function fetchLinkedInPosts(
  profileUrl: string,
  apifyToken: string,
  maxPosts = 5,
): Promise<LinkedInRawPost[]> {
  const input = {
    targetUrls: [profileUrl],
    maxPosts,
    includeReposts: true,
    includeQuotePosts: true,
    scrapeComments: false,
    scrapeReactions: false,
  };
  const posts = await runApifyActorAndFetchItems(
    LINKEDIN_ACTOR_ID,
    input,
    apifyToken,
  );
  return posts as LinkedInRawPost[];
}

/**
 * Fetch LinkedIn posts via johnvc/linkedin-posts-api and map to LinkedInRawPost.
 */
async function fetchLinkedInPostsJohnvc(
  profileUrl: string,
  apifyToken: string,
  maxPosts = 5,
): Promise<LinkedInRawPost[]> {
  const input = {
    profileUrls: [profileUrl],
    maxPostsPerProfile: maxPosts,
  };
  const rows = await runApifyActorAndFetchItems(
    JOHNVC_LINKEDIN_ACTOR_ID,
    input,
    apifyToken,
  );
  const out: LinkedInRawPost[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const mapped = mapJohnvcPostToRaw(row as Record<string, unknown>);
    if (mapped) out.push(mapped);
  }
  return out;
}

/**
 * Get post type
 */
function getPostType(rawPost: LinkedInRawPost): string {
  if (rawPost.postVideo) return "video";
  if (rawPost.postImages && rawPost.postImages.length > 0) return "image";
  return "text";
}

/**
 * Get media URL
 */
function getMediaUrl(rawPost: LinkedInRawPost): string | null {
  if (rawPost.postVideo) return rawPost.postVideo.videoUrl;
  if (rawPost.postImages && rawPost.postImages.length > 0) {
    return rawPost.postImages[0].url;
  }
  return null;
}

/**
 * Process a single LinkedIn post
 */
async function processLinkedInPost(
  ctx: LinkedInScraperContext,
  rawPost: LinkedInRawPost,
  authorAuthority: number,
): Promise<{ saved: boolean; relevant: boolean; score: number }> {
  // Check if exists
  const existsById = await linkedInContentExistsByPostId(
    ctx.dbClient,
    rawPost.id,
  );
  if (existsById) {
    console.log(`    → Skipping (already exists): ${rawPost.id}`);
    return { saved: false, relevant: false, score: 0 };
  }

  // Validate minimum content
  if (!rawPost.content || rawPost.content.length < 50) {
    console.log(`    → Skipping (content too short): ${rawPost.id}`);
    return { saved: false, relevant: false, score: 0 };
  }

  // Generate content hash
  const contentHash = generateContentHash(rawPost.content);

  // Check for duplicate content
  const existsByHash = await linkedInContentExistsByHash(
    ctx.dbClient,
    contentHash,
  );
  if (existsByHash) {
    console.log(
      `    → Skipping (duplicate content detected): ${rawPost.content.slice(0, 40)}...`,
    );
    return { saved: false, relevant: false, score: 0 };
  }

  // Analyze with LLM
  const analysis = await analyzeLinkedInPost(
    rawPost.content,
    rawPost.author.name,
    authorAuthority,
    rawPost.engagement,
    ctx.openrouterApiKey,
  );

  // Calculate post_score
  const postScore = analysis.is_relevant
    ? Math.round((analysis.quality_score * 0.7 + authorAuthority * 0.3) * 100) /
      100
    : 0;

  // Determine author info
  const isRepost = !!rawPost.repostedBy;
  const authorName = isRepost ? rawPost.repostedBy!.name : rawPost.author.name;
  const authorUrl = isRepost
    ? rawPost.repostedBy!.linkedinUrl
    : rawPost.author.linkedinUrl;

  const postedAt =
    isRepost && rawPost.repostedAt
      ? rawPost.repostedAt.date
      : rawPost.postedAt.date;

  const publishedDate = new Date(postedAt);
  const weekDate = getPublicationWeek(publishedDate);

  // Prepare content insert
  const contentInsert: LinkedInContentInsert = {
    post_id: rawPost.id,
    url: rawPost.linkedinUrl,
    author_name: authorName,
    author_headline: rawPost.author.info || null,
    author_profile_url: authorUrl,
    author_profile_image: rawPost.author.avatar?.url || null,
    content: rawPost.content,
    num_likes: rawPost.engagement.likes,
    num_comments: rawPost.engagement.comments,
    num_reposts: rawPost.engagement.shares,
    post_type: getPostType(rawPost),
    media_url: getMediaUrl(rawPost),
    published_at: postedAt,
    post_score: postScore,
    type: "community",
    week_date: weekDate,
    content_hash: contentHash,
  };

  // Save to database
  await createLinkedInContent(ctx.dbClient, contentInsert);

  const isRelevant = postScore >= MIN_RELEVANT_SCORE;

  if (isRelevant) {
    console.log(
      `    ✓ Saved (relevant, score: ${(postScore * 100).toFixed(0)}%): ${rawPost.content.slice(0, 50)}...`,
    );
  } else {
    console.log(
      `    ○ Saved (score: ${(postScore * 100).toFixed(0)}%): ${rawPost.content.slice(0, 50)}...`,
    );
  }

  return { saved: true, relevant: isRelevant, score: postScore };
}

/**
 * Scrape a single LinkedIn profile
 */
export async function scrapeLinkedInProfile(
  dbClient: DatabaseClient,
  openrouterApiKey: string,
  apifyApiToken: string,
  profileUrl: string,
  authorAuthority = 0.7,
  maxPosts = 5,
  linkedinActor: LinkedInActorChoice = "harvestapi",
): Promise<ScrapeResult> {
  console.log(`[LinkedIn] Fetching posts from: ${profileUrl}`);
  console.log(`    Authority: ${(authorAuthority * 100).toFixed(0)}%`);
  console.log(`    Actor: ${linkedinActor}`);

  const ctx: LinkedInScraperContext = {
    dbClient,
    openrouterApiKey,
    apifyApiToken,
  };

  const posts =
    linkedinActor === "johnvc"
      ? await fetchLinkedInPostsJohnvc(profileUrl, apifyApiToken, maxPosts)
      : await fetchLinkedInPosts(profileUrl, apifyApiToken, maxPosts);

  if (posts.length === 0) {
    console.log("    ⚠ No posts found");
    return {
      profileUrl,
      postsFound: 0,
      postsSaved: 0,
      postsRelevant: 0,
      averageScore: 0,
    };
  }

  console.log(`    Found ${posts.length} posts`);

  let savedCount = 0;
  let relevantCount = 0;
  let totalScore = 0;

  for (const post of posts) {
    try {
      const { saved, relevant, score } = await processLinkedInPost(
        ctx,
        post,
        authorAuthority,
      );
      if (saved) {
        savedCount++;
        totalScore += score;
        if (relevant) {
          relevantCount++;
        }
      }
    } catch (error) {
      console.error(`    ✗ Error processing post ${post.id}: ${error}`);
    }

    await sleep(DELAY_BETWEEN_POSTS);
  }

  const averageScore = savedCount > 0 ? Math.round(totalScore / savedCount) : 0;

  return {
    profileUrl,
    postsFound: posts.length,
    postsSaved: savedCount,
    postsRelevant: relevantCount,
    averageScore,
  };
}

/**
 * Scrape all LinkedIn sources from database
 */
export async function scrapeAllLinkedInSources(
  dbClient: DatabaseClient,
  openrouterApiKey: string,
  apifyApiToken: string,
  maxPosts = 5,
  linkedinActor: LinkedInActorChoice = "harvestapi",
): Promise<ScrapeResult[]> {
  console.log("=".repeat(60));
  console.log("LinkedIn Scraper - Scraping All Sources");
  console.log("=".repeat(60));

  const sources = await listLinkedInSources(dbClient, true);

  if (sources.length === 0) {
    console.log("\n⚠ No active LinkedIn sources found in database.");
    return [];
  }

  console.log(`\nFound ${sources.length} active LinkedIn sources\n`);

  const results: ScrapeResult[] = [];

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    console.log(`\n[${i + 1}/${sources.length}] Processing: ${source.name}`);

    try {
      const result = await scrapeLinkedInProfile(
        dbClient,
        openrouterApiKey,
        apifyApiToken,
        source.profile_url,
        source.authority,
        maxPosts,
        linkedinActor,
      );
      results.push(result);
      console.log(
        `    ✓ Done: ${result.postsSaved} saved, ${result.postsRelevant} relevant`,
      );
    } catch (error) {
      console.error(`    ✗ Error: ${error}`);
      results.push({
        profileUrl: source.profile_url,
        postsFound: 0,
        postsSaved: 0,
        postsRelevant: 0,
        averageScore: 0,
      });
    }

    if (i < sources.length - 1) {
      await sleep(2000);
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
