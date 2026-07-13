/**
 * Magento REST client — credential resolution, URL/header building and a
 * retrying fetch wrapper. Mirrors vtex/server/lib/client-factory.ts +
 * the withRetry logic from vtex/server/lib/tool-adapter.ts.
 */
import type { MagentoCredentials } from "../types/env.ts";
import { getOrFetch } from "./cache.ts";

export type { MagentoCredentials };

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 500;

export const DEFAULT_STORE_CODE = "all";
export const DEFAULT_CURRENCY = "BRL";

type CredentialSource = "authorization" | "state" | "env" | "missing";

export interface ResolvedCredentials extends MagentoCredentials {
  /** Where each credential value came from — useful for diagnosing missing config. */
  sources: {
    baseUrl: CredentialSource;
    apiToken: CredentialSource;
    storeCode: CredentialSource;
    originHeader: CredentialSource;
  };
}

function pickSource(
  fromState: string | undefined,
  fromEnv: string | undefined,
): { value: string; source: CredentialSource } {
  if (fromState) return { value: fromState, source: "state" };
  if (fromEnv) return { value: fromEnv, source: "env" };
  return { value: "", source: "missing" };
}

export interface MeshRequestContext {
  authorization?: string;
  state?: Partial<MagentoCredentials>;
}

export function resolveCredentials(
  ctx: MeshRequestContext | undefined,
): ResolvedCredentials {
  const safeState = ctx?.state ?? {};

  const baseUrl = pickSource(safeState.baseUrl, process.env.MAGENTO_BASE_URL);

  const rawAuth = ctx?.authorization;
  const tokenFromAuth = rawAuth
    ? rawAuth.replace(/^Bearer\s+/i, "")
    : undefined;
  const apiToken: { value: string; source: CredentialSource } = tokenFromAuth
    ? { value: tokenFromAuth, source: "authorization" }
    : pickSource(undefined, process.env.MAGENTO_API_TOKEN);

  const storeCode = pickSource(
    safeState.storeCode,
    process.env.MAGENTO_STORE_CODE,
  );
  const originHeader = pickSource(
    safeState.originHeader,
    process.env.MAGENTO_ORIGIN_HEADER,
  );

  if (baseUrl.source === "missing") {
    const stateKeys = safeState ? Object.keys(safeState) : [];
    console.warn(
      "[Magento] resolveCredentials: baseUrl is missing — neither MESH_REQUEST_CONTEXT.state.baseUrl nor process.env.MAGENTO_BASE_URL is set.",
      JSON.stringify({
        receivedStateKeys: stateKeys,
        envMagentoBaseUrlSet: Boolean(process.env.MAGENTO_BASE_URL),
      }),
    );
  }

  return {
    baseUrl: baseUrl.value,
    apiToken: apiToken.value,
    storeCode: storeCode.value || undefined,
    currencyCode: safeState.currencyCode,
    timezone: safeState.timezone,
    originHeader: originHeader.value || undefined,
    extraHeaders: safeState.extraHeaders,
    sources: {
      baseUrl: baseUrl.source,
      apiToken: apiToken.source,
      storeCode: storeCode.source,
      originHeader: originHeader.source,
    },
  };
}

export function assertValidCredentials(
  creds: ResolvedCredentials,
  toolId?: string,
): void {
  const where = toolId ? ` (tool=${toolId})` : "";
  if (!creds.baseUrl) {
    throw new Error(
      `Magento baseUrl is missing${where} — set MESH_REQUEST_CONTEXT.state.baseUrl or the MAGENTO_BASE_URL env var (e.g. https://loja.granado.com.br).`,
    );
  }
  if (!creds.apiToken) {
    throw new Error(
      `Magento apiToken is missing${where} — set the Token field in the MCP connection (Authorization: Bearer) or the MAGENTO_API_TOKEN env var (integration access token).`,
    );
  }
}

export function buildMagentoHeaders(
  creds: MagentoCredentials,
): Record<string, string> {
  return {
    Authorization: `Bearer ${creds.apiToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(creds.originHeader ? { "x-origin-header": creds.originHeader } : {}),
    ...creds.extraHeaders,
  };
}

export function buildRestUrl(
  creds: MagentoCredentials,
  path: string,
  params?: URLSearchParams,
): string {
  const base = creds.baseUrl.replace(/\/+$/, "");
  const storeCode = creds.storeCode || DEFAULT_STORE_CODE;
  const query = params ? `?${params.toString()}` : "";
  return `${base}/rest/${storeCode}/V1${path}${query}`;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface MagentoFetchOptions {
  params?: URLSearchParams;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  toolId?: string;
}

/**
 * Fetch a Magento REST endpoint with timeout + retry (429/5xx/network).
 * Throws a descriptive error on failure; 403 responses get a WAF hint since
 * some stores (e.g. Granado) sit behind a Cloudflare rule that requires the
 * x-origin-header secret.
 */
async function doFetch<T>(
  creds: MagentoCredentials,
  url: string,
  path: string,
  options: MagentoFetchOptions,
): Promise<T> {
  const headers = buildMagentoHeaders(creds);
  const method = options.method ?? "GET";

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        ...(options.body !== undefined
          ? { body: JSON.stringify(options.body) }
          : {}),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      lastError =
        err instanceof Error ? err : new Error("Magento request failed");
      if (attempt < MAX_RETRIES) {
        await sleep(
          INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt) + Math.random() * 200,
        );
        continue;
      }
      break;
    }

    if (response.ok) {
      return (await response.json()) as T;
    }

    const bodyText = await response.text();
    const where = options.toolId ? ` [tool=${options.toolId}]` : "";
    const wafHint =
      response.status === 403
        ? " Hint: a 403 may come from a WAF in front of the store — configure the originHeader (x-origin-header secret) or extraHeaders in the MCP state."
        : "";
    lastError = new Error(
      `Magento API Error: ${response.status} ${method} ${path}${where} — ${bodyText.slice(0, 500)}${wafHint}`,
    );

    if (attempt < MAX_RETRIES && isRetryableStatus(response.status)) {
      await sleep(
        INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt) + Math.random() * 200,
      );
      continue;
    }
    break;
  }

  throw lastError ?? new Error("Magento request failed");
}

export async function magentoFetch<T = unknown>(
  creds: MagentoCredentials,
  path: string,
  options: MagentoFetchOptions = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const url = buildRestUrl(creds, path, options.params);

  if (process.env.DEBUG) {
    console.log("[Magento]", method, url);
  }

  if (method !== "GET") {
    return doFetch<T>(creds, url, path, options);
  }

  const cacheKey = `${creds.baseUrl}|${creds.storeCode ?? "all"}|${url}`;
  return getOrFetch(cacheKey, () => doFetch<T>(creds, url, path, options));
}
