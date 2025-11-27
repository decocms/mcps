export function assertEnvKey(env: Record<string, any>, key: string): void {
  if (!env[key]) {
    throw new Error(`${key} is not set in environment`);
  }
}

export async function parseApiError(
  response: Response,
  apiName: string,
): Promise<never> {
  const errorText = await response.text();

  try {
    const errorJson = JSON.parse(errorText);
    const errorMessage = errorJson.error?.message || errorText;
    throw new Error(errorMessage);
  } catch (error) {
    if (error instanceof Error && !(error instanceof SyntaxError)) {
      throw error;
    }
    throw new Error(
      `${apiName} API error: ${response.status} ${response.statusText}\n${errorText}`,
    );
  }
}

export type ApiResponseType = "json" | "text" | "blob" | "arrayBuffer";

export async function makeApiRequest<T = any>(
  url: string,
  options: RequestInit,
  apiName: string,
  responseType: ApiResponseType = "json",
): Promise<T> {
  const response = await fetch(url, options);

  if (!response.ok) {
    await parseApiError(response, apiName);
  }

  switch (responseType) {
    case "text":
      return (await response.text()) as T;
    case "blob":
      return (await response.blob()) as T;
    case "arrayBuffer":
      return (await response.arrayBuffer()) as T;
    case "json":
    default:
      return (await response.json()) as T;
  }
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
  let base64: string;
  if (typeof Buffer !== "undefined") {
    base64 = Buffer.from(bytes).toString("base64");
  } else {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    base64 = btoa(binary);
  }

  console.log(
    `[fetchImageAsBase64] Successfully converted ${bytes.length} bytes to base64 (${contentType})`,
  );

  return {
    base64,
    mimeType: contentType,
  };
}

export async function downloadFile(url: string): Promise<Blob> {
  console.log(`[downloadFile] Fetching file from: ${url.substring(0, 100)}...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch file: ${response.status} ${response.statusText}`,
    );
  }

  const blob = await response.blob();
  console.log(
    `[downloadFile] Successfully fetched ${blob.size} bytes (${blob.type})`,
  );

  return blob;
}

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
