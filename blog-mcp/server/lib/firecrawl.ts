/**
 * Firecrawl API client for content extraction.
 * Handles scraping URLs and extracting clean content (title, body, author, date).
 */
import { makeApiRequest } from "@decocms/mcps-shared/tools/utils/api-client";

const FIRECRAWL_API_URL = "https://api.firecrawl.dev/v1";

export interface ExtractedContent {
  url: string;
  title: string;
  body: string;
  author: string | null;
  publishedDate: string | null;
  domain: string;
  rawMarkdown: string;
}

interface FirecrawlScrapeResponse {
  success: boolean;
  data?: {
    markdown?: string;
    metadata?: {
      title?: string;
      description?: string;
      author?: string;
      publishedTime?: string;
      ogTitle?: string;
    };
  };
  error?: string;
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return "unknown";
  }
}

/**
 * Scrape a single URL using Firecrawl
 */
export async function scrapeUrl(
  apiKey: string,
  url: string,
): Promise<ExtractedContent> {
  const response = await makeApiRequest<FirecrawlScrapeResponse>(
    `${FIRECRAWL_API_URL}/scrape`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
      }),
    },
    "Firecrawl",
  );

  if (!response.success || !response.data) {
    throw new Error(response.error || "Failed to scrape URL");
  }

  const { markdown = "", metadata = {} } = response.data;

  return {
    url,
    title: metadata.title || metadata.ogTitle || "Untitled",
    body: markdown,
    author: metadata.author || null,
    publishedDate: metadata.publishedTime || null,
    domain: extractDomain(url),
    rawMarkdown: markdown,
  };
}

/**
 * Batch scrape multiple URLs
 */
export async function scrapeUrls(
  apiKey: string,
  urls: string[],
): Promise<{
  results: ExtractedContent[];
  errors: Array<{ url: string; error: string }>;
}> {
  const results: ExtractedContent[] = [];
  const errors: Array<{ url: string; error: string }> = [];

  // Process URLs sequentially to respect rate limits
  for (const url of urls) {
    try {
      const content = await scrapeUrl(apiKey, url);
      results.push(content);
    } catch (error) {
      errors.push({
        url,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return { results, errors };
}

/**
 * Create a Firecrawl client instance
 */
export function createFirecrawlClient(apiKey: string) {
  return {
    scrapeUrl: (url: string) => scrapeUrl(apiKey, url),
    scrapeUrls: (urls: string[]) => scrapeUrls(apiKey, urls),
  };
}
