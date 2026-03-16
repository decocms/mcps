const BASE_URL = "https://api.bfl.ai/v1";
const FETCH_TIMEOUT_MS = 60_000;

interface GenerateResponse {
  id: string;
  polling_url: string;
}

export interface GetResultResponse {
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
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`FLUX API error: ${response.status} - ${error}`);
  }

  return response.json() as Promise<GenerateResponse>;
}

async function getResult(
  config: FluxClientConfig,
  requestId: string,
): Promise<GetResultResponse> {
  const response = await fetch(
    `${BASE_URL}/get_result?id=${encodeURIComponent(requestId)}`,
    {
      headers: { "x-key": config.apiKey },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    },
  );

  // BFL API returns 404 for tasks not yet indexed — parse body as normal response
  if (response.status === 404) {
    return (await response.json()) as GetResultResponse;
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`FLUX polling error: ${response.status} - ${error}`);
  }

  return (await response.json()) as GetResultResponse;
}

export const createFluxClient = (config: FluxClientConfig) => ({
  generateImage: (model: string, params: Record<string, unknown>) =>
    generateImage(config, model, params),
  getResult: (requestId: string) => getResult(config, requestId),
});
