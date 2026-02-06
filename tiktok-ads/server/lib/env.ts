import type { Env } from "./schema.ts";

/**
 * Get TikTok access token from the state configured during MCP installation
 * @param env - The environment containing the deco request context with state
 * @returns The access token
 * @throws Error if not configured
 */
export const getTikTokAccessToken = (env: Env): string => {
  const state =
    env.DECO_REQUEST_CONTEXT?.state || env.MESH_REQUEST_CONTEXT?.state;
  const accessToken = state?.TIKTOK_CREDENTIALS?.accessToken;

  if (!accessToken) {
    throw new Error(
      "TikTok Access Token não configurado. Configure o token na instalação do MCP.",
    );
  }

  return accessToken;
};

/**
 * Get default advertiser ID from the state configured during MCP installation
 * @param env - The environment containing the deco request context with state
 * @returns The default advertiser ID or undefined
 */
export const getDefaultAdvertiserId = (env: Env): string | undefined => {
  const state =
    env.DECO_REQUEST_CONTEXT?.state || env.MESH_REQUEST_CONTEXT?.state;
  return state?.CONFIG?.DEFAULT_ADVERTISER_ID;
};
