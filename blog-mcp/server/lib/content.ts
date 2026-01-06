/**
 * Content processing utilities.
 * Handles normalization, fingerprinting, and summary generation.
 */

/**
 * Normalize text content by:
 * - Trimming whitespace
 * - Normalizing Unicode
 * - Removing excessive whitespace
 * - Converting to lowercase for comparison
 */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKC") // Normalize Unicode
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim()
    .toLowerCase();
}

/**
 * Generate a fingerprint (hash) from title + body.
 * Uses a simple but effective hash for deduplication.
 */
export async function generateFingerprint(
  title: string,
  body: string,
): Promise<string> {
  const normalized = normalizeText(title) + "|" + normalizeText(body);

  // Use Web Crypto API (available in Cloudflare Workers)
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Extract key sentences for summary generation.
 * Simple extractive approach - first N sentences that are meaningful.
 */
function extractKeySentences(text: string, maxSentences = 3): string[] {
  // Split by sentence-ending punctuation
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20); // Only meaningful sentences

  return sentences.slice(0, maxSentences);
}

/**
 * Generate a short summary focused on insights.
 * Uses extractive summarization for simplicity.
 */
export function generateSummary(
  _title: string,
  body: string,
  maxLength = 300,
): string {
  const keySentences = extractKeySentences(body);

  if (keySentences.length === 0) {
    // Fallback to first N characters of body
    return (
      body.substring(0, maxLength).trim() +
      (body.length > maxLength ? "..." : "")
    );
  }

  const summary = keySentences.join(". ") + ".";

  if (summary.length <= maxLength) {
    return summary;
  }

  return summary.substring(0, maxLength - 3).trim() + "...";
}

/**
 * Process extracted content into a normalized format
 */
export interface ProcessedContent {
  url: string;
  domain: string;
  title: string;
  body: string;
  author: string | null;
  publishedDate: string | null;
  fingerprint: string;
  summary: string;
  normalizedTitle: string;
}

export async function processContent(
  url: string,
  domain: string,
  title: string,
  body: string,
  author: string | null,
  publishedDate: string | null,
): Promise<ProcessedContent> {
  const fingerprint = await generateFingerprint(title, body);
  const summary = generateSummary(title, body);
  const normalizedTitle = normalizeText(title);

  return {
    url,
    domain,
    title,
    body,
    author,
    publishedDate,
    fingerprint,
    summary,
    normalizedTitle,
  };
}
