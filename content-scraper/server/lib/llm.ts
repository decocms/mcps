/**
 * LLM Integration (OpenRouter)
 *
 * Functions to interact with LLM for content analysis.
 * Prompts are loaded from markdown files in server/prompts/.
 */

import type {
  LLMArticleAnalysisResponse,
  LLMArticleListResponse,
  LLMLinkedInPostAnalysisResponse,
  LLMRedditPostAnalysisResponse,
} from "../types/content.ts";
import { loadPrompt } from "./prompts.ts";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "anthropic/claude-sonnet-4";
const TEMPERATURE = 0.3;
const MAX_TOKENS = 4000;

/**
 * Call LLM via OpenRouter
 */
async function callLLM(
  systemPrompt: string,
  userMessage: string,
  apiKey: string,
): Promise<string> {
  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://content-scraper-mcp.local",
      "X-Title": "Content Scraper MCP",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (!data.choices || !data.choices[0]?.message?.content) {
    throw new Error("Invalid response from OpenRouter");
  }

  return data.choices[0].message.content;
}

/**
 * Parse JSON response from LLM (handles markdown code blocks)
 */
function parseJsonResponse<T>(content: string): T {
  let jsonStr = content.trim();

  if (jsonStr.startsWith("```json")) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.slice(3);
  }

  if (jsonStr.endsWith("```")) {
    jsonStr = jsonStr.slice(0, -3);
  }

  return JSON.parse(jsonStr.trim());
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Extract list of articles from page content
 */
export async function extractArticlesFromPage(
  pageContent: string,
  blogName: string,
  apiKey: string,
): Promise<LLMArticleListResponse> {
  console.log(`[LLM] Extracting articles from ${blogName}...`);

  const systemPrompt = loadPrompt("article_list_system.md");
  const userMessage = `Extract the blog articles from this page content of "${blogName}":\n\n${pageContent}`;

  const response = await callLLM(systemPrompt, userMessage, apiKey);

  try {
    const parsed = parseJsonResponse<LLMArticleListResponse>(response);

    if (!parsed.articles || !Array.isArray(parsed.articles)) {
      console.warn(`[LLM] Invalid response structure, returning empty list`);
      return { articles: [] };
    }

    console.log(`[LLM] Found ${parsed.articles.length} articles`);
    return parsed;
  } catch (error) {
    console.error(`[LLM] Failed to parse response: ${error}`);
    console.error(`[LLM] Raw response: ${response.slice(0, 500)}...`);
    return { articles: [] };
  }
}

/**
 * Analyze an article for relevance and quality
 */
export async function analyzeArticle(
  title: string,
  content: string,
  authority: number,
  apiKey: string,
): Promise<LLMArticleAnalysisResponse> {
  console.log(`[LLM] Analyzing article: ${title.slice(0, 50)}...`);

  const systemPrompt = loadPrompt("article_analysis_system.md", {
    authority: authority.toFixed(2),
  });
  const userMessage = `Analyze this article:\n\nTitle: ${title}\n\nContent:\n${content.slice(0, 10000)}`;

  const response = await callLLM(systemPrompt, userMessage, apiKey);

  try {
    const parsed = parseJsonResponse<LLMArticleAnalysisResponse>(response);

    return {
      is_mcp_related: Boolean(parsed.is_mcp_related),
      summary: parsed.summary || "",
      key_points: Array.isArray(parsed.key_points) ? parsed.key_points : [],
      quality_score: Math.max(0, Math.min(1, parsed.quality_score || 0)),
    };
  } catch (error) {
    console.error(`[LLM] Failed to parse analysis response: ${error}`);
    console.error(`[LLM] Raw response: ${response.slice(0, 500)}...`);

    return {
      is_mcp_related: false,
      summary: "",
      key_points: [],
      quality_score: 0,
    };
  }
}

/**
 * Analyze a LinkedIn post for relevance and quality
 */
export async function analyzeLinkedInPost(
  content: string,
  authorName: string,
  authority: number,
  engagement: { likes: number; comments: number; shares: number },
  apiKey: string,
): Promise<LLMLinkedInPostAnalysisResponse> {
  console.log(`[LLM] Analyzing LinkedIn post from: ${authorName}...`);

  const systemPrompt = loadPrompt("linkedin_post_analysis_system.md", {
    authority: authority.toFixed(2),
  });
  const userMessage = `Analyze this LinkedIn post:

Author: ${authorName}
Engagement: ${engagement.likes} likes, ${engagement.comments} comments, ${engagement.shares} shares

Content:
${content.slice(0, 5000)}`;

  const response = await callLLM(systemPrompt, userMessage, apiKey);

  try {
    const parsed = parseJsonResponse<LLMLinkedInPostAnalysisResponse>(response);

    return {
      is_relevant: Boolean(parsed.is_relevant),
      summary: parsed.summary || "",
      key_points: Array.isArray(parsed.key_points) ? parsed.key_points : [],
      quality_score: Math.max(0, Math.min(1, parsed.quality_score || 0)),
      relevance_reason: parsed.relevance_reason || "",
    };
  } catch (error) {
    console.error(
      `[LLM] Failed to parse LinkedIn post analysis response: ${error}`,
    );
    console.error(`[LLM] Raw response: ${response.slice(0, 500)}...`);

    return {
      is_relevant: false,
      summary: "",
      key_points: [],
      quality_score: 0,
      relevance_reason: "Failed to analyze post",
    };
  }
}

/**
 * Analyze a Reddit post for relevance and quality
 */
export async function analyzeRedditPost(
  title: string,
  content: string,
  subreddit: string,
  engagement: { upvotes: number; comments: number },
  apiKey: string,
): Promise<LLMRedditPostAnalysisResponse> {
  console.log(`[LLM] Analyzing Reddit post: ${title.slice(0, 50)}...`);

  const systemPrompt = loadPrompt("reddit_post_analysis_system.md", {
    subreddit,
    upvotes: engagement.upvotes,
    comments: engagement.comments,
  });
  const userMessage = `Analyze this Reddit post:

Title: ${title}
Subreddit: r/${subreddit}
Engagement: ${engagement.upvotes} upvotes, ${engagement.comments} comments

Content:
${content.slice(0, 8000)}`;

  const response = await callLLM(systemPrompt, userMessage, apiKey);

  try {
    const parsed = parseJsonResponse<LLMRedditPostAnalysisResponse>(response);

    return {
      is_relevant: Boolean(parsed.is_relevant),
      summary: parsed.summary || "",
      key_points: Array.isArray(parsed.key_points) ? parsed.key_points : [],
      quality_score: Math.max(0, Math.min(1, parsed.quality_score || 0)),
      relevance_reason: parsed.relevance_reason || "",
    };
  } catch (error) {
    console.error(
      `[LLM] Failed to parse Reddit post analysis response: ${error}`,
    );
    console.error(`[LLM] Raw response: ${response.slice(0, 500)}...`);

    return {
      is_relevant: false,
      summary: "",
      key_points: [],
      quality_score: 0,
      relevance_reason: "Failed to analyze post",
    };
  }
}
