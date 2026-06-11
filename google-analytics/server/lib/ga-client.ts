import type { Env } from "../types/env.ts";
import { getGoogleAccessToken } from "./env.ts";

const GA4_DATA_API = "https://analyticsdata.googleapis.com/v1beta";
const GA4_ADMIN_API = "https://analyticsadmin.googleapis.com/v1beta";
// Property annotations are v1alpha-only (not present in v1beta).
const GA4_ADMIN_ALPHA_API = "https://analyticsadmin.googleapis.com/v1alpha";

// Hard limit on pagination loops to prevent runaway requests if GA4 returns a
// repeated nextPageToken during a quota event or transient backend failure.
const MAX_PAGES = 50;

// Accepts "properties/1234567", "1234567", or 1234567 — always returns "properties/XXXXXXX".
// Throws on malformed input, preventing path traversal via "../" segments.
export function normalizeProperty(property: string): string {
  const clean = String(property).trim();
  if (/^\d+$/.test(clean)) return `properties/${clean}`;
  if (/^properties\/\d+$/.test(clean)) return clean;
  throw new Error(
    `Invalid property identifier: "${property.slice(0, 64)}". Use "properties/XXXXXXX" or a numeric ID like "1234567".`,
  );
}

export class GaClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  static fromEnv(env: Env): GaClient {
    return new GaClient(getGoogleAccessToken(env));
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: {
        ...init.headers,
        "Content-Type": "application/json",
        // Authorization is last so it is never overridden by init.headers
        Authorization: `Bearer ${this.accessToken}`,
      },
    });
    if (!res.ok) {
      // Surface only the structured error fields to avoid leaking OAuth details
      // or verbose diagnostic payloads from Google's error responses.
      let message = `${res.status}`;
      try {
        const body = await res.json() as { error?: { message?: string; status?: string } };
        const err = body?.error;
        if (err?.status || err?.message) {
          message = `${res.status} ${err.status ?? ""} - ${err.message ?? ""}`.trim();
        }
      } catch {
        // If the body isn't JSON, fall back to the status code only.
      }
      throw new Error(`Google Analytics API error: ${message}`);
    }
    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }

  // Shared paginator for Admin API list endpoints that return a single resource
  // collection with nextPageToken. Fetches all pages up to MAX_PAGES.
  private async listAllPages<T>(
    baseUrl: string,
    key: string,
  ): Promise<T[]> {
    const items: T[] = [];
    let pageToken: string | undefined;
    let pages = 0;
    do {
      if (++pages > MAX_PAGES) {
        throw new Error(
          `Pagination exceeded ${MAX_PAGES} pages for ${baseUrl}. The GA4 API may be returning a repeated nextPageToken.`,
        );
      }
      const url = new URL(baseUrl);
      url.searchParams.set("pageSize", "200");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const page = await this.request<Record<string, unknown>>(url.toString());
      const chunk = page[key];
      if (Array.isArray(chunk)) items.push(...(chunk as T[]));
      pageToken = page.nextPageToken as string | undefined;
    } while (pageToken);
    return items;
  }

  // ── Data API ──────────────────────────────────────────────────────────────

  async runReport(property: string, body: object): Promise<unknown> {
    const prop = normalizeProperty(property);
    return this.request(`${GA4_DATA_API}/${prop}:runReport`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async runRealtimeReport(property: string, body: object): Promise<unknown> {
    const prop = normalizeProperty(property);
    return this.request(`${GA4_DATA_API}/${prop}:runRealtimeReport`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async runFunnelReport(property: string, body: object): Promise<unknown> {
    const prop = normalizeProperty(property);
    return this.request(`${GA4_DATA_API}/${prop}:runFunnelReport`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  // ── Admin API ─────────────────────────────────────────────────────────────

  async listAccountSummaries(): Promise<unknown> {
    const summaries = await this.listAllPages(
      `${GA4_ADMIN_API}/accountSummaries`,
      "accountSummaries",
    );
    return { accountSummaries: summaries };
  }

  async getProperty(name: string): Promise<unknown> {
    const prop = normalizeProperty(name);
    return this.request(`${GA4_ADMIN_API}/${prop}`);
  }

  async listCustomDimensions(parent: string): Promise<unknown> {
    const prop = normalizeProperty(parent);
    const items = await this.listAllPages(
      `${GA4_ADMIN_API}/${prop}/customDimensions`,
      "customDimensions",
    );
    return { customDimensions: items };
  }

  async listCustomMetrics(parent: string): Promise<unknown> {
    const prop = normalizeProperty(parent);
    const items = await this.listAllPages(
      `${GA4_ADMIN_API}/${prop}/customMetrics`,
      "customMetrics",
    );
    return { customMetrics: items };
  }

  async listGoogleAdsLinks(parent: string): Promise<unknown> {
    const prop = normalizeProperty(parent);
    const items = await this.listAllPages(
      `${GA4_ADMIN_API}/${prop}/googleAdsLinks`,
      "googleAdsLinks",
    );
    return { googleAdsLinks: items };
  }

  // Uses v1alpha — reportingDataAnnotations is not available in v1beta.
  async listPropertyAnnotations(parent: string): Promise<unknown> {
    const prop = normalizeProperty(parent);
    const items = await this.listAllPages(
      `${GA4_ADMIN_ALPHA_API}/${prop}/reportingDataAnnotations`,
      "reportingDataAnnotations",
    );
    return { reportingDataAnnotations: items };
  }
}
