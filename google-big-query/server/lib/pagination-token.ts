// server/lib/pagination-token.ts

/**
 * Encodes a BigQuery jobId and API pageToken into a single opaque string.
 * Format: base64(jobId + "\n" + apiPageToken)
 * The newline is the separator — jobIds and pageTokens never contain newlines.
 */
/**
 * The job's location travels inside the token: BigQuery answers 404
 * "Not found: Job" to jobs.getQueryResults for any job outside the US/EU
 * multi-regions (e.g. southamerica-east1) unless `location` is passed, so a
 * page-2 fetch without it fails for every non-US dataset.
 */
export function encodePageToken(
  jobId: string,
  apiToken: string,
  location?: string,
): string {
  return btoa(
    location ? `${jobId}\n${apiToken}\n${location}` : `${jobId}\n${apiToken}`,
  );
}

export function decodePageToken(token: string): {
  jobId: string;
  apiToken: string;
  location?: string;
} {
  const decoded = atob(token);
  const parts = decoded.split("\n");
  if (parts.length < 2) throw new Error("Invalid pageToken format");
  // Tokens issued before the location was encoded have two parts.
  const [jobId, apiToken, location] = parts;
  return location ? { jobId, apiToken, location } : { jobId, apiToken };
}
