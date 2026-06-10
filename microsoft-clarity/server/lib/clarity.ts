import type { Env } from "../main.ts";

const API_BASE_URL = "https://clarity.microsoft.com/mcp";

interface ClarityRequestOptions {
  method: string;
  body?: any;
  token?: string;
}

export async function callClarityApi(
  env: Env,
  endpoint: string,
  options: ClarityRequestOptions,
) {
  const state = env.state as any;
  const token =
    options.token ||
    state.API_CREDENTIALS?.API_KEY ||
    process.env.CLARITY_API_TOKEN;

  if (!token) {
    throw new Error(
      "Clarity API token not configured. Please provide it in the tool parameters or MCP configuration.",
    );
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: options.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Clarity API error (${response.status}): ${errorText}`);
  }

  return response.json();
}
