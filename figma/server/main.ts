import { type DefaultEnv, withRuntime } from "@decocms/runtime";
import type { Registry } from "@decocms/mcps-shared/registry";
import { serve } from "@decocms/mcps-shared/serve";
import { z } from "zod";
import { tools } from "./tools/index.ts";
import { FIGMA_SCOPES } from "./constants.ts";

const StateSchema = z.object({});

export type Env = DefaultEnv<typeof StateSchema, Registry>;

const FIGMA_CLIENT_ID = process.env.FIGMA_CLIENT_ID ?? "";
const FIGMA_CLIENT_SECRET = process.env.FIGMA_CLIENT_SECRET ?? "";

const runtime = withRuntime<Env, typeof StateSchema>({
  oauth: {
    mode: "PKCE",
    authorizationServer: "https://www.figma.com",

    authorizationUrl: (callbackUrl) => {
      const callback = new URL(callbackUrl);
      const state = callback.searchParams.get("state");
      callback.searchParams.delete("state");

      const url = new URL("https://www.figma.com/oauth");
      url.searchParams.set("client_id", FIGMA_CLIENT_ID);
      url.searchParams.set("redirect_uri", callback.toString());
      url.searchParams.set("scope", FIGMA_SCOPES.join(","));
      url.searchParams.set("response_type", "code");
      if (state) url.searchParams.set("state", state);
      return url.toString();
    },

    exchangeCode: async ({ code, redirect_uri }) => {
      const response = await fetch("https://api.figma.com/v1/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: FIGMA_CLIENT_ID,
          client_secret: FIGMA_CLIENT_SECRET,
          redirect_uri: redirect_uri ?? "",
          code,
          grant_type: "authorization_code",
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(
          `Figma OAuth token exchange failed: ${response.status} - ${error}`,
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

    refreshToken: async (refreshToken: string) => {
      const response = await fetch("https://api.figma.com/v1/oauth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: FIGMA_CLIENT_ID,
          client_secret: FIGMA_CLIENT_SECRET,
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(
          `Figma token refresh failed: ${response.status} - ${error}`,
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
        refresh_token: data.refresh_token ?? refreshToken,
        expires_in: data.expires_in,
      };
    },
  },

  tools,
  prompts: [],
});

serve(runtime.fetch);
