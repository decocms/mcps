// server/lib/pagination-token.ts

/**
 * Encodes a BigQuery jobId, API pageToken and job location into one opaque
 * string. Format: base64(jobId + "\n" + apiPageToken [+ "\n" + location])
 * The newline is the separator — none of the three ever contains one.
 *
 * The location is required to fetch page 2+ of a job outside the US/EU
 * multi-regions (e.g. southamerica-east1): jobs.getQueryResults without it
 * looks the job up in US and 404s "Not found: Job".
 * Tokens without a location (minted before this change) still decode.
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
  const [jobId, apiToken, location] = atob(token).split("\n");
  if (apiToken === undefined) throw new Error("Invalid pageToken format");
  return { jobId, apiToken, ...(location ? { location } : {}) };
}
