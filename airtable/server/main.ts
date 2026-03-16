import { type DefaultEnv, withRuntime } from "@decocms/runtime";
import type { Registry } from "@decocms/mcps-shared/registry";
import { serve } from "@decocms/mcps-shared/serve";
import { z } from "zod";
import { tools } from "./tools/index.ts";
import { AIRTABLE_SCOPES } from "./constants.ts";

const StateSchema = z.object({});

export type Env = DefaultEnv<typeof StateSchema, Registry>;

const runtime = withRuntime<Env, typeof StateSchema>({
  oauth: {
    mode: "PKCE",
    authorizationServer: "https://airtable.com",
    authorizationUrl: (callbackUrl) => {
      const callback = new URL(callbackUrl);
      const state = callback.searchParams.get("state");
      callback.searchParams.delete("state");

      const url = new URL("https://airtable.com/oauth2/v1/authorize");
      url.searchParams.set("client_id", process.env.AIRTABLE_CLIENT_ID ?? "");
      url.searchParams.set("redirect_uri", callback.toString());
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", AIRTABLE_SCOPES.join(" "));
      if (state) url.searchParams.set("state", state);
      return url.toString();
    },
    exchangeCode: async ({ code, code_verifier, redirect_uri }) => {
      const clientId = process.env.AIRTABLE_CLIENT_ID ?? "";
      const clientSecret = process.env.AIRTABLE_CLIENT_SECRET ?? "";

      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
      };

      // Airtable confidential clients require Basic auth with client_id:client_secret
      if (clientSecret) {
        headers["Authorization"] =
          `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
      }

      const response = await fetch("https://airtable.com/oauth2/v1/token", {
        method: "POST",
        headers,
        body: new URLSearchParams({
          client_id: clientId,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirect_uri ?? "",
          code_verifier: code_verifier ?? "",
        }),
      });

      if (!response.ok) {
        throw new Error(`Airtable auth failed: ${response.status}`);
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        token_type: string;
        expires_in?: number;
      };

      return {
        access_token: data.access_token,
        token_type: data.token_type,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
      };
    },
    refreshToken: async (refreshToken: string) => {
      const clientId = process.env.AIRTABLE_CLIENT_ID ?? "";
      const clientSecret = process.env.AIRTABLE_CLIENT_SECRET ?? "";

      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
      };

      if (clientSecret) {
        headers["Authorization"] =
          `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
      }

      const response = await fetch("https://airtable.com/oauth2/v1/token", {
        method: "POST",
        headers,
        body: new URLSearchParams({
          client_id: clientId,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(
          `Airtable token refresh failed: ${response.status} - ${error}`,
        );
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        token_type: string;
        expires_in?: number;
      };

      return {
        access_token: data.access_token,
        token_type: data.token_type,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
      };
    },
  },
  tools,
  prompts: [],
});

serve(runtime.fetch);
