/**
 * LLM Integration (OpenRouter)
 *
 * Functions to interact with LLM for content analysis.
 */

import type {
  LLMArticleAnalysisResponse,
  LLMArticleListResponse,
  LLMLinkedInPostAnalysisResponse,
  LLMRedditPostAnalysisResponse,
} from "../types/content.ts";

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
// Prompts
// =============================================================================

const ARTICLE_LIST_SYSTEM_PROMPT = `You are an expert at extracting blog article information from web page content.
Given the page content, extract all visible blog articles/posts.

IMPORTANT: The page content contains links in markdown format: [link text](url)
You MUST use the EXACT URLs from these links. Do NOT guess or invent URLs.

For each article, provide:
- title: The article title
- url: The EXACT full URL from the link (do not modify or guess URLs)
- published_at: The publication date if visible (in YYYY-MM-DD format, or null if not found)

Respond ONLY with valid JSON in this exact format:
{
  "articles": [
    { "title": "string", "url": "string", "published_at": "string or null" }
  ]
}

Only include actual blog posts/articles, not navigation links, author pages, or category pages.
Limit to the 10 most recent articles visible on the page.
CRITICAL: Use the exact URLs from the markdown links in the content. Never invent URLs.`;

const ARTICLE_ANALYSIS_SYSTEM_PROMPT = (authority: number) =>
  `You are an expert at analyzing blog articles about technology.
Your task is to:
1. Determine if the article is related to MCP (Model Context Protocol) - this includes articles about AI agents, LLM tools, AI integrations, Claude, Anthropic, or similar AI/ML infrastructure topics.
2. Generate a concise summary (2-3 sentences)
3. Extract 3-5 key points from the article
4. Calculate a quality_score from 0.0 to 1.0 based on:
   - How well-written and informative the article is
   - Technical depth and accuracy
   - Practical value and actionable insights
   - Relevance to MCP/AI topics

The source has an authority rating of ${authority.toFixed(2)} (0.0 = low trust, 1.0 = high trust).
Factor this into your quality assessment - higher authority sources should be weighted more favorably.

Respond ONLY with valid JSON in this exact format:
{
  "is_mcp_related": boolean,
  "summary": "string",
  "key_points": ["point1", "point2", "point3"],
  "quality_score": number
}

quality_score should be between 0.0 and 1.0.
If you cannot determine if the article is MCP-related or if there's insufficient content, set is_mcp_related to false.`;

const LINKEDIN_POST_ANALYSIS_SYSTEM_PROMPT = (authority: number) =>
  `You are an expert at analyzing LinkedIn posts about technology.
Your task is to:
1. Determine if the post is relevant and valuable - this includes posts about:
   - MCP (Model Context Protocol), AI agents, LLM tools, AI integrations
   - Software engineering best practices, architecture, system design
   - Developer tools, productivity, career insights
   - Tech industry news, trends, and analysis
   - Startup/product insights from tech leaders

2. Generate a concise summary (1-2 sentences)
3. Extract 2-4 key points from the post
4. Calculate a quality_score from 0.0 to 1.0 based on:
   - How insightful and valuable the content is
   - Technical depth or unique perspective
   - Practical value and actionable insights
   - Engagement potential (is it thought-provoking?)

5. Provide a brief reason why the post is or isn't relevant

The author has an authority rating of ${authority.toFixed(2)} (0.0 = low trust, 1.0 = high trust).
Factor this into your quality assessment - higher authority authors should be weighted more favorably.

IMPORTANT: Be selective. Only mark posts as relevant if they provide genuine value.
Generic motivational posts, simple announcements without substance, or low-effort content should NOT be marked as relevant.

Respond ONLY with valid JSON in this exact format:
{
  "is_relevant": boolean,
  "summary": "string",
  "key_points": ["point1", "point2"],
  "quality_score": number,
  "relevance_reason": "string"
}

quality_score should be between 0.0 and 1.0.
If the post is too short or lacks substance, set is_relevant to false.`;

const REDDIT_POST_ANALYSIS_SYSTEM_PROMPT = (
  subreddit: string,
  upvotes: number,
  comments: number,
) =>
  `You are an expert at analyzing Reddit posts about AI and technology.
You are analyzing a post from r/${subreddit}.

Your task is to:
1. Determine if the post is relevant and valuable - this includes posts about:
   - MCP (Model Context Protocol), AI agents, LLM tools, AI integrations
   - Software engineering best practices, architecture, system design
   - Developer tools, productivity, AI-assisted coding
   - RAG systems, embeddings, vector databases
   - Agent frameworks (LangChain, LangGraph, CrewAI, AutoGen, etc)
   - AI/ML infrastructure, deployment, and production challenges
   - Open source AI tools and libraries

2. Generate a concise summary (2-3 sentences)
3. Extract 2-4 key points from the post
4. Calculate a quality_score from 0.0 to 1.0 based on:
   - How insightful and valuable the content is
   - Technical depth or unique perspective
   - Practical value and actionable insights
   - Community engagement (this post has ${upvotes} upvotes and ${comments} comments)
   - Whether it provides real solutions or just asks questions

5. Provide a brief reason why the post is or isn't relevant

IMPORTANT: Be selective. Only mark posts as relevant if they provide genuine value.
- Simple questions without substance should NOT be marked as relevant
- Self-promotion without real content should NOT be marked as relevant
- Posts with actual code, architecture, or detailed explanations ARE valuable
- Posts discussing production challenges and solutions ARE valuable
- Posts introducing useful open source tools ARE valuable

Respond ONLY with valid JSON in this exact format:
{
  "is_relevant": boolean,
  "summary": "string",
  "key_points": ["point1", "point2"],
  "quality_score": number,
  "relevance_reason": "string"
}

quality_score should be between 0.0 and 1.0.
If the post is too short or lacks substance, set is_relevant to false.`;

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

  const userMessage = `Extract the blog articles from this page content of "${blogName}":\n\n${pageContent}`;

  const response = await callLLM(
    ARTICLE_LIST_SYSTEM_PROMPT,
    userMessage,
    apiKey,
  );

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

  const systemPrompt = ARTICLE_ANALYSIS_SYSTEM_PROMPT(authority);
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

  const systemPrompt = LINKEDIN_POST_ANALYSIS_SYSTEM_PROMPT(authority);
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

  const systemPrompt = REDDIT_POST_ANALYSIS_SYSTEM_PROMPT(
    subreddit,
    engagement.upvotes,
    engagement.comments,
  );
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
