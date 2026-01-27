/**
 * Shared Google OAuth configuration for all Google MCPs
 *
 * Usage:
 * ```ts
 * import { createGoogleOAuth } from "@decocms/mcps-shared/google-oauth";
 *
 * const runtime = withRuntime({
 *   oauth: createGoogleOAuth({
 *     scopes: ["https://www.googleapis.com/auth/calendar"],
 *   }),
 *   // ...
 * });
 * ```
 */

export interface GoogleOAuthConfig {
  /**
   * Google OAuth scopes required by this MCP
   * @example ["https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/calendar.events"]
   */
  scopes: string[];

  /**
   * Optional: Custom client ID (defaults to process.env.GOOGLE_CLIENT_ID)
   */
  clientId?: string;

  /**
   * Optional: Custom client secret (defaults to process.env.GOOGLE_CLIENT_SECRET)
   */
  clientSecret?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
  scope?: string;
}

/**
 * Creates a Google OAuth configuration for use with @decocms/runtime
 */
export function createGoogleOAuth(config: GoogleOAuthConfig) {
  const getClientId = () => config.clientId ?? process.env.GOOGLE_CLIENT_ID!;
  const getClientSecret = () =>
    config.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET!;
  const scopeString = config.scopes.join(" ");

  return {
    mode: "PKCE" as const,
    authorizationServer: "https://accounts.google.com",

    /**
     * Generates the Google OAuth authorization URL
     * Handles Google's requirement for clean redirect_uri (without state param)
     */
    authorizationUrl: (callbackUrl: string) => {
      const callbackUrlObj = new URL(callbackUrl);
      const state = callbackUrlObj.searchParams.get("state");

      // Google requires redirect_uri without state parameter
      callbackUrlObj.searchParams.delete("state");
      const cleanRedirectUri = callbackUrlObj.toString();

      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.searchParams.set("redirect_uri", cleanRedirectUri);
      url.searchParams.set("client_id", getClientId());
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", scopeString);
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");

      // Pass state as separate OAuth parameter
      if (state) {
        url.searchParams.set("state", state);
      }

      return url.toString();
    },

    /**
     * Exchanges the authorization code for access and refresh tokens
     */
    exchangeCode: async ({
      code,
      code_verifier,
      redirect_uri,
    }: {
      code: string;
      code_verifier?: string;
      redirect_uri?: string;
    }) => {
      if (!redirect_uri) {
        throw new Error(
          "redirect_uri is required for Google OAuth token exchange",
        );
      }

      const params = new URLSearchParams({
        code,
        client_id: getClientId(),
        client_secret: getClientSecret(),
        grant_type: "authorization_code",
        redirect_uri,
      });

      if (code_verifier) {
        params.set("code_verifier", code_verifier);
      }

      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Google OAuth failed: ${response.status} - ${error}`);
      }

      const data = (await response.json()) as TokenResponse;

      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_type: data.token_type || "Bearer",
        expires_in: data.expires_in,
        scope: data.scope,
      };
    },

    /**
     * Refreshes the access token using the refresh token
     */
    refreshToken: async (refreshToken: string) => {
      const params = new URLSearchParams({
        refresh_token: refreshToken,
        client_id: getClientId(),
        client_secret: getClientSecret(),
        grant_type: "refresh_token",
      });

      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(
          `Google OAuth refresh failed: ${response.status} - ${error}`,
        );
      }

      const data = (await response.json()) as TokenResponse;

      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_type: data.token_type || "Bearer",
        expires_in: data.expires_in,
        scope: data.scope,
      };
    },
  };
}
