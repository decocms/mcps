interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

type OAuthParams = {
  code: string;
  redirect_uri?: string;
  code_verifier?: string;
  // Backward-compatible aliases
  redirectUri?: string;
  codeVerifier?: string;
};

export function createGoogleOAuth(opts: { scopes: string[] }) {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const scope = opts.scopes.join(" ");

  return {
    mode: "PKCE",
    authorizationServer: "https://accounts.google.com",
    authorizationUrl: (callbackUrl: string) => {
      const callback = new URL(callbackUrl);
      const state = callback.searchParams.get("state");

      // Google rejects redirect_uri when it includes reserved params like state.
      callback.searchParams.delete("state");

      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", callback.toString());
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", scope);
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");

      if (state) {
        url.searchParams.set("state", state);
      }

      return url.toString();
    },
    exchangeCode: async (oauthParams: OAuthParams) => {
      const redirectUriRaw =
        oauthParams.redirect_uri ?? oauthParams.redirectUri;
      if (!redirectUriRaw) {
        throw new Error("Google token exchange failed: redirect_uri is missing");
      }

      // Keep the exact callback used in auth, but never include state in redirect_uri.
      const redirectUri = new URL(redirectUriRaw);
      redirectUri.searchParams.delete("state");

      const codeVerifier =
        oauthParams.code_verifier ?? oauthParams.codeVerifier;

      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: oauthParams.code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri.toString(),
          grant_type: "authorization_code",
          ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
        }),
      });

      if (!res.ok) {
        throw new Error(
          `Google token exchange failed (${res.status}): ${await res.text()}`,
        );
      }

      const data = (await res.json()) as TokenResponse;
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_type: data.token_type ?? "Bearer",
        expires_in: data.expires_in,
        scope: data.scope,
      };
    },
    refreshToken: async (refreshToken: string) => {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "refresh_token",
        }),
      });

      if (!res.ok) {
        throw new Error(
          `Google token refresh failed (${res.status}): ${await res.text()}`,
        );
      }

      const data = (await res.json()) as TokenResponse;
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token ?? refreshToken,
        token_type: data.token_type ?? "Bearer",
        expires_in: data.expires_in,
        scope: data.scope,
      };
    },
  };
}
