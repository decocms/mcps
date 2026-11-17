import type { Env } from "../types/env.ts";
import { login } from "./login.ts";

const BASE_URLS = {
  us: "https://dy-api.com/v2",
  eu: "https://dy-api.eu/v2",
} as const;

const TIMEOUT_MS = 30_000;
const ADMIN_URL = "https://adm.dynamicyield.com";

export function baseUrl(region: keyof typeof BASE_URLS | undefined): string {
  return BASE_URLS[region ?? "us"];
}

export function getApiKey(env: Env): string {
  const auth = env.MESH_REQUEST_CONTEXT?.authorization ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (!key) {
    throw new Error(
      "Unauthorized: missing Dynamic Yield API key. Configure the connection with a server-side DY API key.",
    );
  }
  return key;
}

export async function dyFetch(
  env: Env,
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown; apiKey?: string } = {},
): Promise<Record<string, unknown>> {
  const response = await fetch(
    `${baseUrl(env.MESH_REQUEST_CONTEXT?.state?.region)}${path}`,
    {
      method: init.method ?? "POST",
      headers: {
        "DY-API-Key": init.apiKey ?? getApiKey(env),
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  return parseResponse(response);
}

async function parseResponse(
  response: Response,
): Promise<Record<string, unknown>> {
  const traceId = response.headers.get("DY-Trace-ID") ?? undefined;
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Dynamic Yield API error ${response.status}${traceId ? ` (DY-Trace-ID ${traceId})` : ""}: ${text.slice(0, 2000)}`,
    );
  }
  if (!text) return { status: response.status, traceId };
  const data: unknown = JSON.parse(text);
  // Some endpoints (transaction status) return a bare array.
  return Array.isArray(data)
    ? { items: data, traceId }
    : { ...(data as Record<string, unknown>), traceId };
}

// ponytail: per-isolate cache, a cold isolate logs in again (one extra round trip).
const sessions = new Map<string, Promise<string>>();

/** RefreshToken pasted by the user, or one from logging in with email + password. */
async function getSession(env: Env, fresh = false): Promise<string> {
  const state = env.MESH_REQUEST_CONTEXT?.state;
  if (state?.adminSession) return state.adminSession;
  const { adminEmail: email, adminPassword: password } = state ?? {};
  if (!email || !password) {
    throw new Error(
      "Missing DY console login: set adminEmail and adminPassword in the configuration (or adminSession for 2FA/SSO accounts).",
    );
  }
  if (fresh || !sessions.has(email)) {
    const pending = login(email, password);
    sessions.set(email, pending);
    pending.catch(() => sessions.delete(email));
  }
  return sessions.get(email) as Promise<string>;
}

/**
 * Calls the DY console's internal API (what adm.dynamicyield.com uses).
 * Undocumented: the console mints a short-lived session from the RefreshToken
 * cookie on every call, and scopes the request with the DY_SECTION_ID header.
 */
export async function adminFetch(
  env: Env,
  path: string,
  init: {
    method?: "GET" | "POST" | "PUT";
    body?: unknown;
    sectionId?: string;
  } = {},
): Promise<Record<string, unknown>> {
  const state = env.MESH_REQUEST_CONTEXT?.state;
  const sectionId = init.sectionId ?? state?.sectionId;
  // Every console route needs it; some silently fall back to the last-used section without it.
  if (!sectionId) {
    throw new Error(
      "Missing sectionId: set it in the configuration or pass it to the tool. It is the redirectToSectionId in the DY console URL.",
    );
  }
  const call = async (session: string) =>
    fetch(`${ADMIN_URL}${path}`, {
      method: init.method ?? "GET",
      redirect: "manual",
      headers: {
        Cookie: `RefreshToken=${session}`,
        DY_SECTION_ID: sectionId,
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  // An expired session comes back as 401 "OAuth flow failed." or a redirect to the login page.
  const expired = (r: Response) =>
    r.status === 401 || (r.status >= 300 && r.status < 400);

  let response = await call(await getSession(env));
  if (expired(response) && !state?.adminSession) {
    response = await call(await getSession(env, true));
  }
  if (expired(response)) {
    throw new Error(
      state?.adminSession
        ? "DY console session expired or invalid: log in to adm.dynamicyield.com again and update adminSession (RefreshToken cookie), or use adminEmail and adminPassword instead."
        : "DY console rejected the session right after logging in.",
    );
  }
  return parseResponse(response);
}
