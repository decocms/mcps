import type { Env } from "../../shared/deco.gen.ts";

/**
 * Get TikTok access token from the state configured during MCP installation
 * @param env - The environment containing the deco request context with state
 * @returns The access token
 * @throws Error if not configured
 */
export const getTikTokAccessToken = (env: Env): string => {
  const accessToken = env.DECO_REQUEST_CONTEXT?.state?.accessToken;

  if (!accessToken) {
    throw new Error(
      "TikTok Access Token não configurado. Configure o token na instalação do MCP.",
    );
  }

  return accessToken;
};
