import type { Env } from "../../shared/deco.gen.ts";
import { GoogleAdsClient } from "./google-ads-client.ts";
import { GoogleAdsAuthError, GoogleAdsConfigError } from "./types.ts";

/**
 * Get Google OAuth access token from environment context
 * @param env - The environment containing the mesh request context
 * @returns The OAuth access token
 * @throws GoogleAdsAuthError if not authenticated
 */
export const getGoogleAccessToken = (env: Env): string => {
  const authorization = env.MESH_REQUEST_CONTEXT?.authorization;
  if (!authorization) {
    throw new GoogleAdsAuthError(
      "Not authenticated. Please authorize with Google Ads first.",
    );
  }
  return authorization;
};

/**
 * Get Google Ads Developer Token from environment context or process env
 * @param env - The environment containing the mesh request context
 * @returns The developer token
 * @throws GoogleAdsConfigError if developer token is not configured
 */
export const getDeveloperToken = (env: Env): string => {
  const developerToken =
    env.MESH_REQUEST_CONTEXT?.state?.developerToken ||
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

  if (!developerToken) {
    throw new GoogleAdsConfigError(
      "Developer token not configured. Please set the developerToken in state or GOOGLE_ADS_DEVELOPER_TOKEN environment variable.",
    );
  }
  return developerToken;
};

/**
 * Create a configured GoogleAdsClient instance
 * @param env - The environment containing auth and configuration
 * @returns A configured GoogleAdsClient instance
 * @throws GoogleAdsAuthError if not authenticated
 * @throws GoogleAdsConfigError if developer token is not configured
 */
export const createGoogleAdsClient = (env: Env): GoogleAdsClient => {
  return new GoogleAdsClient({
    accessToken: getGoogleAccessToken(env),
    developerToken: getDeveloperToken(env),
  });
};
