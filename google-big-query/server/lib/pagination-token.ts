// server/lib/pagination-token.ts

/**
 * Encodes a BigQuery jobId and API pageToken into a single opaque string.
 * Format: base64(jobId + "\n" + apiPageToken)
 * The newline is the separator — jobIds and pageTokens never contain newlines.
 */
export function encodePageToken(jobId: string, apiToken: string): string {
  return btoa(`${jobId}\n${apiToken}`);
}

export function decodePageToken(token: string): {
  jobId: string;
  apiToken: string;
} {
  const decoded = atob(token);
  const nl = decoded.indexOf("\n");
  if (nl === -1) throw new Error("Invalid pageToken format");
  return { jobId: decoded.slice(0, nl), apiToken: decoded.slice(nl + 1) };
}
