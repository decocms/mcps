/**
 * Shopify Admin GraphQL client — credential resolution, endpoint building and
 * a retrying fetch wrapper. Mirrors magento/server/lib/client.ts: the access
 * token comes from the connection-level Authorization field
 * (MESH_REQUEST_CONTEXT.authorization) and the store domain from state.
 */
import {
  DEFAULT_API_VERSION,
  INITIAL_RETRY_DELAY_MS,
  MAX_RETRIES,
  REQUEST_TIMEOUT_MS,
} from "../constants.ts";
import type { ShopifyCredentials } from "../types/env.ts";

export type { ShopifyCredentials };

type CredentialSource = "authorization" | "state" | "env" | "missing";

export interface ResolvedCredentials extends ShopifyCredentials {
  /** Where each credential value came from — useful for diagnosing missing config. */
  sources: {
    storeDomain: CredentialSource;
    accessToken: CredentialSource;
  };
}

export interface MeshRequestContext {
  authorization?: string | null;
  state?: { storeDomain?: string; apiVersion?: string };
}

/**
 * Normalize a store domain: accepts "my-store", "my-store.myshopify.com",
 * "https://my-store.myshopify.com/" or a custom domain, returns a bare host.
 */
export function normalizeStoreDomain(input: string): string {
  let domain = input.trim().replace(/^https?:\/\//i, "");
  domain = domain.replace(/\/.*$/, "").replace(/\.$/, "");
  if (domain && !domain.includes(".")) {
    domain = `${domain}.myshopify.com`;
  }
  return domain;
}

export function resolveCredentials(
  ctx: MeshRequestContext | undefined,
): ResolvedCredentials {
  const state = ctx?.state ?? {};

  let storeDomain: { value: string; source: CredentialSource };
  if (state.storeDomain) {
    storeDomain = { value: state.storeDomain, source: "state" };
  } else if (process.env.SHOPIFY_STORE_DOMAIN) {
    storeDomain = { value: process.env.SHOPIFY_STORE_DOMAIN, source: "env" };
  } else {
    storeDomain = { value: "", source: "missing" };
  }

  const rawAuth = ctx?.authorization;
  const tokenFromAuth = rawAuth
    ? rawAuth.replace(/^Bearer\s+/i, "").trim()
    : undefined;
  let accessToken: { value: string; source: CredentialSource };
  if (tokenFromAuth) {
    accessToken = { value: tokenFromAuth, source: "authorization" };
  } else if (process.env.SHOPIFY_ACCESS_TOKEN) {
    accessToken = { value: process.env.SHOPIFY_ACCESS_TOKEN, source: "env" };
  } else {
    accessToken = { value: "", source: "missing" };
  }

  return {
    storeDomain: storeDomain.value
      ? normalizeStoreDomain(storeDomain.value)
      : "",
    accessToken: accessToken.value,
    apiVersion:
      state.apiVersion ||
      process.env.SHOPIFY_API_VERSION ||
      DEFAULT_API_VERSION,
    sources: {
      storeDomain: storeDomain.source,
      accessToken: accessToken.source,
    },
  };
}

export function assertValidCredentials(
  creds: ResolvedCredentials,
  toolId?: string,
): void {
  const where = toolId ? ` (tool=${toolId})` : "";
  if (!creds.storeDomain) {
    throw new Error(
      `Shopify storeDomain is missing${where} — set the Store Domain field in the MCP connection (e.g. my-store.myshopify.com) or the SHOPIFY_STORE_DOMAIN env var.`,
    );
  }
  if (!creds.accessToken) {
    throw new Error(
      `Shopify access token is missing${where} — set the Token field in the MCP connection (Authorization: Bearer, an Admin API access token from a custom app) or the SHOPIFY_ACCESS_TOKEN env var.`,
    );
  }
}

export function buildGraphqlUrl(creds: ShopifyCredentials): string {
  const version = creds.apiVersion || DEFAULT_API_VERSION;
  return `https://${creds.storeDomain}/admin/api/${version}/graphql.json`;
}

interface GraphqlError {
  message: string;
  extensions?: { code?: string; [key: string]: unknown };
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: GraphqlError[];
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isThrottled(errors: GraphqlError[] | undefined): boolean {
  return Boolean(errors?.some((e) => e.extensions?.code === "THROTTLED"));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoff(attempt: number): Promise<void> {
  return sleep(
    INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt) + Math.random() * 200,
  );
}

/**
 * Execute an Admin GraphQL query with timeout + retry (429/5xx/network and
 * GraphQL THROTTLED errors). Throws a descriptive error on HTTP failure or
 * when the response carries GraphQL errors.
 */
export async function shopifyGraphql<T = unknown>(
  creds: ShopifyCredentials,
  query: string,
  variables: Record<string, unknown> = {},
  toolId?: string,
): Promise<T> {
  const url = buildGraphqlUrl(creds);
  const where = toolId ? ` [tool=${toolId}]` : "";

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Shopify-Access-Token": creds.accessToken,
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      lastError =
        err instanceof Error ? err : new Error("Shopify request failed");
      if (attempt < MAX_RETRIES) {
        await backoff(attempt);
        continue;
      }
      break;
    }

    if (!response.ok) {
      const bodyText = await response.text();
      const authHint =
        response.status === 401 || response.status === 403
          ? " Hint: check that the Admin API access token is valid and has the required read scopes."
          : response.status === 404
            ? " Hint: a 404 usually means the store domain is wrong (expected my-store.myshopify.com)."
            : "";
      lastError = new Error(
        `Shopify API Error: ${response.status}${where} — ${bodyText.slice(0, 500)}${authHint}`,
      );
      if (attempt < MAX_RETRIES && isRetryableStatus(response.status)) {
        await backoff(attempt);
        continue;
      }
      break;
    }

    const payload = (await response.json()) as GraphqlResponse<T>;

    if (payload.errors?.length) {
      if (isThrottled(payload.errors) && attempt < MAX_RETRIES) {
        await backoff(attempt);
        continue;
      }
      const scopeHint = payload.errors.some(
        (e) => e.extensions?.code === "ACCESS_DENIED",
      )
        ? " Hint: the access token is missing a required read scope for this resource."
        : "";
      lastError = new Error(
        `Shopify GraphQL Error${where}: ${payload.errors
          .map((e) => e.message)
          .join("; ")
          .slice(0, 800)}${scopeHint}`,
      );
      break;
    }

    if (payload.data === undefined || payload.data === null) {
      lastError = new Error(`Shopify GraphQL Error${where}: empty response`);
      break;
    }

    return payload.data;
  }

  throw lastError ?? new Error("Shopify request failed");
}

/** Shape of a flattened GraphQL connection. */
export interface Page<T> {
  items: T[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

interface Connection<T> {
  nodes?: T[];
  edges?: { node: T; cursor?: string }[];
  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
}

/** Flatten a GraphQL connection ({nodes|edges, pageInfo}) into {items, pageInfo}. */
export function flattenConnection<T = unknown>(raw: unknown): Page<T> {
  const connection = (raw ?? {}) as Connection<T>;
  const items = connection.nodes ?? connection.edges?.map((e) => e.node) ?? [];
  return {
    items,
    pageInfo: {
      hasNextPage: connection.pageInfo?.hasNextPage ?? false,
      endCursor: connection.pageInfo?.endCursor ?? null,
    },
  };
}

/**
 * Coerce a numeric/legacy id or bare handle-safe id to a Shopify GID.
 * "123" → "gid://shopify/Product/123"; existing gid:// values pass through.
 */
export function toGid(resource: string, id: string): string {
  if (id.startsWith("gid://")) return id;
  return `gid://shopify/${resource}/${id}`;
}
