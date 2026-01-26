import type { Env } from "../../shared/deco.gen.ts";

export const getApiKey = (env: Env): string => {
  const apiKey = env.DECO_REQUEST_CONTEXT?.state?.apiKey;

  if (!apiKey) {
    throw new Error(
      "Resend API Key not configured. Please configure the API key during MCP installation.",
    );
  }

  return apiKey;
};

export const getDefaultFrom = (env: Env): string | undefined => {
  const state = env.DECO_REQUEST_CONTEXT?.state;
  if (!state) return undefined;

  const { defaultFrom, defaultFromName } = state;

  if (!defaultFrom) return undefined;

  // If defaultFromName is provided and defaultFrom is just an email
  if (defaultFromName && !defaultFrom.includes("<")) {
    return `${defaultFromName} <${defaultFrom}>`;
  }

  return defaultFrom;
};
