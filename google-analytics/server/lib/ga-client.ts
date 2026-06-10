import type { Env } from "../types/env.ts";
import { getGoogleAccessToken } from "./env.ts";

const GA4_DATA_API = "https://analyticsdata.googleapis.com/v1beta";
const GA4_ADMIN_API = "https://analyticsadmin.googleapis.com/v1beta";

// Accepts "properties/1234567", "1234567", or 1234567 — always returns "properties/XXXXXXX".
// Throws on malformed input, preventing path traversal via "../" segments.
export function normalizeProperty(property: string): string {
  const clean = String(property).trim();
  if (/^\d+$/.test(clean)) return `properties/${clean}`;
  if (/^properties\/\d+$/.test(clean)) return clean;
  throw new Error(
    `Invalid property identifier: "${property}". Use "properties/XXXXXXX" or a numeric ID like "1234567".`,
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
      const text = await res.text();
      throw new Error(`Google Analytics API error: ${res.status} - ${text}`);
    }
    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
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

  // ── Admin API ─────────────────────────────────────────────────────────────

  // Fetches all pages (default GA4 page size is 50; max is 200).
  async listAccountSummaries(): Promise<unknown> {
    const summaries: unknown[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL(`${GA4_ADMIN_API}/accountSummaries`);
      url.searchParams.set("pageSize", "200");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const page = await this.request<{
        accountSummaries?: unknown[];
        nextPageToken?: string;
      }>(url.toString());
      if (page.accountSummaries) summaries.push(...page.accountSummaries);
      pageToken = page.nextPageToken;
    } while (pageToken);
    return { accountSummaries: summaries };
  }

  async getProperty(name: string): Promise<unknown> {
    const prop = normalizeProperty(name);
    return this.request(`${GA4_ADMIN_API}/${prop}`);
  }

  async listCustomDimensions(parent: string): Promise<unknown> {
    const prop = normalizeProperty(parent);
    return this.request(`${GA4_ADMIN_API}/${prop}/customDimensions`);
  }

  async listCustomMetrics(parent: string): Promise<unknown> {
    const prop = normalizeProperty(parent);
    return this.request(`${GA4_ADMIN_API}/${prop}/customMetrics`);
  }

  async listGoogleAdsLinks(parent: string): Promise<unknown> {
    const prop = normalizeProperty(parent);
    return this.request(`${GA4_ADMIN_API}/${prop}/googleAdsLinks`);
  }

  async listPropertyAnnotations(parent: string): Promise<unknown> {
    const prop = normalizeProperty(parent);
    return this.request(`${GA4_ADMIN_API}/${prop}/propertyAnnotations`);
  }
}
