/**
 * Dropbox API v2 fetch helpers.
 *
 * Two base URLs:
 *   - RPC:     https://api.dropboxapi.com/2/{namespace}/{endpoint}
 *   - Content: https://content.dropboxapi.com/2/{namespace}/{endpoint}
 *
 * Content endpoints carry the JSON arg in the `Dropbox-API-Arg` header
 * instead of the body — that pattern is isolated in `dropboxContentFetch`.
 *
 * 401 responses surface as `OAuthInvalidGrantError` so the mesh evicts the
 * cached access token and forces a refresh on the next call. 429 responses
 * are honoured with a single `Retry-After` sleep before retrying once.
 */

import { OAuthInvalidGrantError } from "@decocms/runtime";
import type { Env } from "../types/env.ts";

const RPC_BASE = "https://api.dropboxapi.com/2";
const CONTENT_BASE = "https://content.dropboxapi.com/2";
const MAX_RETRY_WAIT_MS = 30_000;

export class DropboxApiError extends Error {
  constructor(
    public status: number,
    public endpoint: string,
    public body: string,
  ) {
    super(`Dropbox API ${status} on ${endpoint}: ${body}`);
    this.name = "DropboxApiError";
  }
}

/** Pull the user's bearer token off the per-request mesh context. */
export function getAccessToken(env: Env): string {
  const auth = env.MESH_REQUEST_CONTEXT?.authorization;
  if (!auth) {
    throw new Error(
      "Missing authorization header. Please authenticate with Dropbox first.",
    );
  }
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1].trim()) {
    throw new Error("Invalid authorization header. Expected Bearer token.");
  }
  return match[1].trim();
}

/** Convenience for tool execute(): pull env off the AppContext ctx arg. */
export function envFromCtx(ctx: unknown): Env {
  // The AppContext generic from @decocms/runtime/tools constrains its Env
  // parameter to a registry type that doesn't include all of @decocms/runtime's
  // top-level Registry — cast via unknown so we can use our richer Env without
  // the BindingRegistry constraint complaint.
  return (ctx as { env: Env }).env;
}

interface JsonRequestOptions {
  /** JSON body — passed as application/json. Omit for endpoints that take no args. */
  body?: unknown;
  /** Override the default `application/json` content-type (rarely needed). */
  contentType?: string | null;
  /** Already attempted a 429 retry — do not retry again. */
  _retried?: boolean;
}

async function handleResponse(
  endpoint: string,
  response: Response,
): Promise<unknown> {
  if (response.status === 401) {
    const text = await response.text().catch(() => "");
    throw new OAuthInvalidGrantError(
      "invalid_grant",
      `Dropbox rejected the access token (401): ${text}`,
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new DropboxApiError(response.status, endpoint, text);
  }

  // Most Dropbox RPC endpoints return JSON; some return empty (e.g. /save_url).
  const ct = response.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const text = await response.text();
    return text ? text : null;
  }
  return response.json();
}

function parseRetryAfterMs(header: string | null): number {
  if (!header) return 1_000;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1_000, MAX_RETRY_WAIT_MS);
  }
  // Could be HTTP-date — fall back to a short sleep.
  return 1_000;
}

/**
 * RPC-style call: POST JSON body to https://api.dropboxapi.com/2/{endpoint}.
 * `endpoint` should NOT have a leading slash — e.g. "files/list_folder".
 */
export async function dropboxFetch<T = unknown>(
  env: Env,
  endpoint: string,
  options: JsonRequestOptions = {},
): Promise<T> {
  const token = getAccessToken(env);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  let body: BodyInit | null = null;
  if (options.body !== undefined) {
    if (options.contentType === null) {
      // Caller wants no Content-Type — pass body verbatim (rare for RPC).
      body = options.body as BodyInit;
    } else {
      headers["Content-Type"] = options.contentType ?? "application/json";
      body = JSON.stringify(options.body);
    }
  }

  const response = await fetch(`${RPC_BASE}/${endpoint}`, {
    method: "POST",
    headers,
    body,
  });

  if (response.status === 429 && !options._retried) {
    const waitMs = parseRetryAfterMs(response.headers.get("retry-after"));
    await new Promise((r) => setTimeout(r, waitMs));
    return dropboxFetch<T>(env, endpoint, { ...options, _retried: true });
  }

  return (await handleResponse(endpoint, response)) as T;
}

interface ContentRequestOptions {
  /** JSON object serialised into the `Dropbox-API-Arg` header. */
  arg: unknown;
  /** Optional binary body (uploads). Omit for download endpoints. */
  body?: BodyInit;
  /** Optional content type for the binary body. Defaults to octet-stream. */
  bodyContentType?: string;
  _retried?: boolean;
}

/**
 * Content-style call against https://content.dropboxapi.com/2/{endpoint}.
 *
 * Arg goes in `Dropbox-API-Arg` (ASCII-safe JSON). For downloads, the
 * response body is the file bytes and metadata is mirrored in the
 * `Dropbox-API-Result` header — both are returned to the caller so they can
 * decide how to surface them. For uploads, pass `body` with the bytes.
 */
export async function dropboxContentFetch(
  env: Env,
  endpoint: string,
  options: ContentRequestOptions,
): Promise<{ headers: Headers; response: Response }> {
  const token = getAccessToken(env);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    // Dropbox-API-Arg must be ASCII-safe. Escape non-ASCII codepoints.
    "Dropbox-API-Arg": asciiSafeJson(options.arg),
  };

  if (options.body !== undefined) {
    headers["Content-Type"] =
      options.bodyContentType ?? "application/octet-stream";
  }

  const response = await fetch(`${CONTENT_BASE}/${endpoint}`, {
    method: "POST",
    headers,
    body: options.body ?? null,
  });

  if (response.status === 429 && !options._retried) {
    const waitMs = parseRetryAfterMs(response.headers.get("retry-after"));
    await new Promise((r) => setTimeout(r, waitMs));
    return dropboxContentFetch(env, endpoint, { ...options, _retried: true });
  }

  if (response.status === 401) {
    const text = await response.text().catch(() => "");
    throw new OAuthInvalidGrantError(
      "invalid_grant",
      `Dropbox rejected the access token (401): ${text}`,
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new DropboxApiError(response.status, endpoint, text);
  }

  return { headers: response.headers, response };
}

/**
 * Dropbox requires Dropbox-API-Arg headers to be ASCII. Escape any non-ASCII
 * characters as \uXXXX so e.g. emoji or accented filenames don't break the
 * request.
 */
function asciiSafeJson(value: unknown): string {
  return JSON.stringify(value).replace(/[-￿]/g, (c) => {
    return "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0");
  });
}
