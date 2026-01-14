/**
 * Google Drive MCP Server
 */
import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import { tools } from "./tools/index.ts";
import type { Env } from "../shared/deco.gen.ts";

export type { Env };

const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.file",
].join(" ");

let lastRedirectUri: string | null = null;

const runtime = withRuntime<Env>({
  tools: (env: Env) => tools.map((createTool) => createTool(env)),
  oauth: {
    mode: "PKCE",
    authorizationServer: "https://accounts.google.com",
    authorizationUrl: (callbackUrl) => {
      const callbackUrlObj = new URL(callbackUrl);
      const state = callbackUrlObj.searchParams.get("state");
      callbackUrlObj.searchParams.delete("state");
      const cleanRedirectUri = callbackUrlObj.toString();
      lastRedirectUri = cleanRedirectUri;

      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.searchParams.set("redirect_uri", cleanRedirectUri);
      url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", DRIVE_SCOPES);
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");
      if (state) url.searchParams.set("state", state);
      return url.toString();
    },
    exchangeCode: async ({
      code,
      code_verifier,
      code_challenge_method,
    }: any) => {
      if (!lastRedirectUri) {
        throw new Error(
          "redirect_uri is required for Google OAuth token exchange",
        );
      }
      const params = new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "authorization_code",
        redirect_uri: lastRedirectUri,
      });
      if (code_verifier) params.set("code_verifier", code_verifier);
      if (code_challenge_method)
        params.set("code_challenge_method", code_challenge_method);

      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      });
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Google OAuth failed: ${response.status} - ${error}`);
      }
      const data = (await response.json()) as any;
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_type: data.token_type || "Bearer",
        expires_in: data.expires_in,
      };
    },
  },
});

serve(runtime.fetch);
