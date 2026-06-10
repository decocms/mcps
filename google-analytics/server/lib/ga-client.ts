import type { Env } from "../types/env.ts";
import { getGoogleAccessToken } from "./env.ts";

const GA4_DATA_API = "https://analyticsdata.googleapis.com/v1beta";
const GA4_ADMIN_API = "https://analyticsadmin.googleapis.com/v1beta";

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
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Analytics API error: ${res.status} - ${text}`);
    }
    return res.json() as Promise<T>;
  }

  // ── Data API ──────────────────────────────────────────────────────────────

  async runReport(property: string, body: object): Promise<unknown> {
    return this.request(`${GA4_DATA_API}/${property}:runReport`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async runRealtimeReport(property: string, body: object): Promise<unknown> {
    return this.request(`${GA4_DATA_API}/${property}:runRealtimeReport`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  // ── Admin API ─────────────────────────────────────────────────────────────

  async listAccountSummaries(): Promise<unknown> {
    return this.request(`${GA4_ADMIN_API}/accountSummaries`);
  }

  async getProperty(name: string): Promise<unknown> {
    return this.request(`${GA4_ADMIN_API}/${name}`);
  }

  async listCustomDimensions(parent: string): Promise<unknown> {
    return this.request(`${GA4_ADMIN_API}/${parent}/customDimensions`);
  }

  async listCustomMetrics(parent: string): Promise<unknown> {
    return this.request(`${GA4_ADMIN_API}/${parent}/customMetrics`);
  }

  async listGoogleAdsLinks(parent: string): Promise<unknown> {
    return this.request(`${GA4_ADMIN_API}/${parent}/googleAdsLinks`);
  }
}
