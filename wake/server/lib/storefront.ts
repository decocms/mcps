/**
 * Wake Storefront GraphQL client.
 *
 * The Storefront API lives at a single fixed endpoint and identifies the store
 * through the `TCS-Access-Token` header — there is no per-account host.
 */
import type { Env } from "../types/env.ts";

const STOREFRONT_ENDPOINT = "https://storefront-api.fbits.net/graphql";
const REQUEST_TIMEOUT_MS = 30_000;

export interface StorefrontClient {
  query<T = Record<string, unknown>>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T>;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

/** Reads the Storefront token from the per-request configuration state. */
export function getStorefrontToken(env: Env): string {
  const token = env.MESH_REQUEST_CONTEXT?.state?.storefrontToken;
  if (!token) {
    throw new Error(
      "Wake storefrontToken is not configured. Set it in the MCP configuration (used as the TCS-Access-Token header).",
    );
  }
  return token;
}

export function createStorefrontClient(env: Env): StorefrontClient {
  const token = getStorefrontToken(env);

  return {
    async query<T = Record<string, unknown>>(
      query: string,
      variables: Record<string, unknown> = {},
    ): Promise<T> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(STOREFRONT_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "TCS-Access-Token": token,
          },
          body: JSON.stringify({ query, variables }),
          signal: controller.signal,
        });
      } catch (error) {
        if ((error as { name?: string })?.name === "AbortError") {
          throw new Error(
            `Wake Storefront API request timed out after ${REQUEST_TIMEOUT_MS}ms.`,
          );
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Wake Storefront API HTTP ${response.status} ${response.statusText}: ${body.slice(0, 500)}`,
        );
      }

      const json = (await response.json()) as GraphQLResponse<T>;

      if (json.errors?.length) {
        throw new Error(
          `Wake Storefront GraphQL error: ${json.errors
            .map((e) => e.message)
            .join("; ")}`,
        );
      }

      if (json.data === undefined || json.data === null) {
        throw new Error("Wake Storefront API returned no data.");
      }

      return json.data;
    },
  };
}
