/**
 * Utility Functions
 *
 * Helper functions for scraping, text processing, and date handling.
 */

import * as crypto from "crypto";

/**
 * Generate a unique ID using crypto
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Calculate publication week in ISO format (YYYY-wWW)
 */
export function getPublicationWeek(date: Date): string {
  const year = date.getFullYear();
  const firstDayOfYear = new Date(year, 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  const weekNumber = Math.ceil(
    (pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7,
  );
  return `${year}-w${weekNumber.toString().padStart(2, "0")}`;
}

/**
 * Check if a date is within the last week
 */
export function isWithinLastWeek(date: Date): boolean {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  return date >= oneWeekAgo;
}

/**
 * Format date as YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Parse date string to Date
 */
export function parseDate(dateStr: string): Date | null {
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Get current week in YYYY-wWW format
 */
export function getCurrentWeek(): string {
  return getPublicationWeek(new Date());
}

/**
 * Calculate final post_score
 * 70% quality_score + 30% authority
 */
export function calculatePostScore(
  qualityScore: number,
  authority: number,
): number {
  const score = qualityScore * 0.7 + authority * 0.3;
  return Math.round(score * 100) / 100;
}

/**
 * Extract text with links in markdown format from HTML
 * Preserves URLs for LLM to identify articles
 */
export function extractTextWithLinks(html: string, baseUrl: string): string {
  // Remove script, style, noscript, nav, footer, header
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ");

  // Convert links to markdown [text](url)
  const base = new URL(baseUrl);
  text = text.replace(
    /<a\s+(?:[^>]*?\s+)?href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_match, href, linkText) => {
      const cleanText = linkText.replace(/<[^>]+>/g, "").trim();
      if (!cleanText || !href) return cleanText;

      let absoluteUrl: string;
      try {
        absoluteUrl = new URL(href, base).href;
      } catch {
        absoluteUrl = href;
      }

      return `[${cleanText}](${absoluteUrl})`;
    },
  );

  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(parseInt(code)));

  // Clean excessive whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

/**
 * Extract plain text from HTML (without links)
 * Used to extract article content
 */
export function extractPlainText(html: string): string {
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ")
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, " ");

  text = text.replace(/<[^>]+>/g, " ");

  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(parseInt(code)));

  text = text.replace(/\s+/g, " ").trim();

  return text;
}

/**
 * Sleep for ms milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalize text for hash comparison
 */
export function normalizeTextForHash(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim()
    .slice(0, 1000);
}

/**
 * Generate SHA-256 hash for duplicate detection
 */
export function generateContentHash(text: string): string {
  const normalized = normalizeTextForHash(text);
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Fetch with retry and exponential backoff
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 3,
): Promise<Response> {
  const delays = [1000, 2000, 3000];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          ...options.headers,
        },
      });

      if (response.ok) {
        return response;
      }

      if (attempt < maxRetries) {
        console.log(
          `[Retry ${attempt + 1}/${maxRetries}] Status ${response.status} for ${url}`,
        );
        await sleep(delays[attempt]);
        continue;
      }

      return response;
    } catch (error) {
      if (attempt < maxRetries) {
        console.log(
          `[Retry ${attempt + 1}/${maxRetries}] Error fetching ${url}: ${error}`,
        );
        await sleep(delays[attempt]);
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Failed to fetch ${url} after ${maxRetries} retries`);
}

/**
 * Validate minimum content length
 */
export function hasMinimumContent(content: string, minLength = 100): boolean {
  return content.length >= minLength;
}

/**
 * Format number as percentage
 */
export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}
