/**
 * Shared utilities for making API requests with consistent error handling
 */

/**
 * Assert that an environment variable is set
 */
export function assertEnvKey(env: Record<string, any>, key: string): void {
  if (!env[key]) {
    throw new Error(`${key} is not set in environment`);
  }
}

/**
 * Parse error response from API
 */
export async function parseApiError(
  response: Response,
  apiName: string,
): Promise<never> {
  const errorText = await response.text();

  // Try to parse the error as JSON to extract meaningful message
  try {
    const errorJson = JSON.parse(errorText);
    const errorMessage = errorJson.error?.message || errorText;
    throw new Error(errorMessage);
  } catch (e) {
    // If JSON parsing fails or no error message, use the raw error text
    if (e instanceof Error && e.message !== errorText) {
      throw e; // Re-throw if it's our own error
    }
    throw new Error(
      `${apiName} API error: ${response.status} ${response.statusText}\n${errorText}`,
    );
  }
}

/**
 * Make a generic API request with consistent error handling
 */
export async function makeApiRequest(
  url: string,
  options: RequestInit,
  apiName: string,
): Promise<any> {
  const response = await fetch(url, options);

  if (!response.ok) {
    await parseApiError(response, apiName);
  }

  return await response.json();
}

/**
 * Poll a resource until it meets a completion condition or times out
 */
export async function pollUntilComplete<T>(options: {
  checkFn: () => Promise<T>;
  isDoneFn: (result: T) => boolean;
  getErrorFn?: (result: T) => string | null;
  maxWaitMs?: number;
  pollIntervalMs?: number;
  timeoutMessage?: string;
}): Promise<T> {
  const {
    checkFn,
    isDoneFn,
    getErrorFn,
    maxWaitMs = 600000, // 10 minutes default
    pollIntervalMs = 10000, // 10 seconds default
    timeoutMessage = `Operation timed out after ${maxWaitMs}ms`,
  } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const result = await checkFn();

    if (isDoneFn(result)) {
      return result;
    }

    // Check for error condition if provided
    if (getErrorFn) {
      const error = getErrorFn(result);
      if (error) {
        throw new Error(`Operation failed: ${error}`);
      }
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(timeoutMessage);
}

/**
 * Fetch and convert image to base64
 * Supports both HTTP URLs and data URLs
 */
export async function fetchImageAsBase64(imageUrl: string): Promise<{
  base64: string;
  mimeType: string;
}> {
  console.log(
    `[fetchImageAsBase64] Fetching image from: ${imageUrl.substring(0, 100)}...`,
  );

  // If it's already a data URL, extract the base64 part
  if (imageUrl.startsWith("data:")) {
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return {
        mimeType: match[1],
        base64: match[2],
      };
    }
    throw new Error("Invalid data URL format");
  }

  // Fetch the image from HTTP(S) URL
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch image: ${response.status} ${response.statusText}`,
    );
  }

  // Get the content type
  const contentType = response.headers.get("content-type") || "image/jpeg";

  // Convert to base64
  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // Convert bytes to base64
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  console.log(
    `[fetchImageAsBase64] Successfully converted ${bytes.length} bytes to base64 (${contentType})`,
  );

  return {
    base64,
    mimeType: contentType,
  };
}

/**
 * Download content from URL with authentication
 */
export async function downloadWithAuth(
  url: string,
  authHeaders: Record<string, string>,
  apiName: string,
): Promise<Blob> {
  const response = await fetch(url, {
    method: "GET",
    headers: authHeaders,
  });

  if (!response.ok) {
    await parseApiError(response, apiName);
  }

  return await response.blob();
}
