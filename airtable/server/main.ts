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
      const url = new URL("https://airtable.com/oauth2/v1/authorize");
      url.searchParams.set("redirect_uri", callbackUrl);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", AIRTABLE_SCOPES.join(" "));
      return url.toString();
    },
    exchangeCode: async ({ code, code_verifier, redirect_uri }) => {
      const response = await fetch("https://airtable.com/oauth2/v1/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
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
  },
  tools,
  prompts: [],
});

serve(runtime.fetch);
