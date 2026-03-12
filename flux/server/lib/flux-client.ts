const BASE_URL = "https://api.bfl.ai/v1";
const POLL_INTERVAL_MS = 1000;
const MAX_POLL_TIME_MS = 300_000;
const FETCH_TIMEOUT_MS = 60_000;

interface GenerateResponse {
  id: string;
  polling_url: string;
}

interface PollResult {
  id: string;
  status:
    | "Pending"
    | "Ready"
    | "Error"
    | "Task not found"
    | "Request Moderated"
    | "Content Moderated";
  result?: {
    sample?: string;
    [key: string]: unknown;
  };
  progress?: number;
}

export interface FluxClientConfig {
  apiKey: string;
}

async function generateImage(
  config: FluxClientConfig,
  model: string,
  params: Record<string, unknown>,
): Promise<GenerateResponse> {
  const response = await fetch(`${BASE_URL}/${model}`, {
    method: "POST",
    headers: {
      "x-key": config.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`FLUX API error: ${response.status} - ${error}`);
  }

  return response.json() as Promise<GenerateResponse>;
}

async function pollResult(
  config: FluxClientConfig,
  pollingUrl: string,
): Promise<PollResult> {
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_POLL_TIME_MS) {
    const response = await fetch(pollingUrl, {
      headers: { "x-key": config.apiKey },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`FLUX polling error: ${response.status} - ${error}`);
    }

    const result = (await response.json()) as PollResult;

    if (result.status === "Ready") {
      return result;
    }

    if (
      result.status === "Error" ||
      result.status === "Task not found" ||
      result.status === "Request Moderated" ||
      result.status === "Content Moderated"
    ) {
      throw new Error(`FLUX generation failed: ${result.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error("FLUX generation timed out after 300 seconds");
}

export const createFluxClient = (config: FluxClientConfig) => ({
  generateImage: (model: string, params: Record<string, unknown>) =>
    generateImage(config, model, params),
  pollResult: (pollingUrl: string) => pollResult(config, pollingUrl),
});
