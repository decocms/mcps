import { VWO_API_BASE } from "../constants.ts";

export class VWOClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${VWO_API_BASE}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        token: this.token,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`VWO API error ${response.status}: ${body}`);
    }

    const json = (await response.json()) as Record<string, unknown>;

    if (
      json._errors &&
      Array.isArray(json._errors) &&
      json._errors.length > 0
    ) {
      throw new Error(`VWO API errors: ${JSON.stringify(json._errors)}`);
    }

    return json._data as T;
  }

  private buildQueryString(
    params: Record<string, string | number | boolean | undefined>,
  ): string {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        qs.set(key, String(value));
      }
    }
    const str = qs.toString();
    return str ? `?${str}` : "";
  }

  // ─── Workspaces ───

  async listWorkspaces(params?: {
    includeCurrent?: string;
    status?: string;
  }): Promise<unknown> {
    const qs = this.buildQueryString(params ?? {});
    return this.request(`/accounts${qs}`);
  }

  async getWorkspace(accountId: string): Promise<unknown> {
    return this.request(`/accounts/${accountId}`);
  }

  async createWorkspace(body: { name: string }): Promise<unknown> {
    return this.request("/accounts", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  // ─── Campaigns ───

  async listCampaigns(
    accountId: string,
    params?: {
      limit?: number;
      offset?: number;
      type?: string;
      platform?: string;
      label?: string;
      showDetailedInfo?: boolean;
      projectId?: number;
      sdkKey?: string;
    },
  ): Promise<unknown> {
    const qs = this.buildQueryString(params ?? {});
    return this.request(`/accounts/${accountId}/campaigns${qs}`);
  }

  async getCampaign(accountId: string, campaignId: number): Promise<unknown> {
    return this.request(`/accounts/${accountId}/campaigns/${campaignId}`);
  }

  async getCampaignShareLink(
    accountId: string,
    campaignId: number,
  ): Promise<unknown> {
    return this.request(`/accounts/${accountId}/campaigns/${campaignId}/share`);
  }

  async updateCampaignStatus(
    accountId: string,
    body: { ids: number[]; status: string },
  ): Promise<unknown> {
    return this.request(`/accounts/${accountId}/campaigns/status`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  // ─── Goals ───

  async listGoals(accountId: string, campaignId: number): Promise<unknown> {
    return this.request(`/accounts/${accountId}/campaigns/${campaignId}/goals`);
  }

  async getGoal(
    accountId: string,
    campaignId: number,
    goalId: number,
  ): Promise<unknown> {
    return this.request(
      `/accounts/${accountId}/campaigns/${campaignId}/goals/${goalId}`,
    );
  }

  async createGoal(
    accountId: string,
    campaignId: number,
    body: {
      name: string;
      type: string;
      urls?: Array<{ type: string; value: string }>;
      excludedUrls?: Array<{ type: string; value: string }>;
      cssSelectors?: string[];
      isPrimary?: boolean;
    },
  ): Promise<unknown> {
    return this.request(
      `/accounts/${accountId}/campaigns/${campaignId}/goals`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  }

  async updateGoal(
    accountId: string,
    campaignId: number,
    goalId: number,
    body: {
      name?: string;
      type?: string;
      urls?: Array<{ type: string; value: string }>;
      excludedUrls?: Array<{ type: string; value: string }>;
      cssSelectors?: string[];
      isPrimary?: boolean;
    },
  ): Promise<unknown> {
    // Note: VWO API uses singular "campaign" in the update path
    return this.request(
      `/accounts/${accountId}/campaign/${campaignId}/goals/${goalId}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
    );
  }

  // ─── Variations ───

  async listVariations(
    accountId: string,
    campaignId: number,
  ): Promise<unknown> {
    return this.request(
      `/accounts/${accountId}/campaigns/${campaignId}/variations`,
    );
  }

  // ─── Sections ───

  async listSections(accountId: string, campaignId: number): Promise<unknown> {
    return this.request(
      `/accounts/${accountId}/campaigns/${campaignId}/sections`,
    );
  }

  // ─── Feature Flags ───

  async listFeatures(accountId: string): Promise<unknown> {
    return this.request(`/accounts/${accountId}/features`);
  }

  async createFeature(
    accountId: string,
    body: {
      name: string;
      featureKey: string;
      description?: string;
      featureType?: string;
      goals: Array<{ metricId: number }>;
      variables?: Array<{
        variableName: string;
        dataType: string;
        defaultValue: string;
      }>;
    },
  ): Promise<unknown> {
    return this.request(`/accounts/${accountId}/features`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  // ─── Feature Flag Rules ───

  async listFeatureRules(
    accountId: string,
    environmentId: string,
    featureId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<unknown> {
    const qs = this.buildQueryString(params ?? {});
    return this.request(
      `/accounts/${accountId}/environments/${environmentId}/features/${featureId}/rules${qs}`,
    );
  }

  async createFeatureRule(
    accountId: string,
    environmentId: string,
    featureId: string,
    body: {
      name: string;
      key: string;
      type?: string;
      campaignData?: {
        percentSplit?: number;
        variations?: Array<{ featureVariationId: number }>;
      };
    },
  ): Promise<unknown> {
    return this.request(
      `/accounts/${accountId}/environments/${environmentId}/features/${featureId}/rules`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  }

  // ─── Metric Reports ───

  async getMetricReport(accountId: string, reportId: string): Promise<unknown> {
    return this.request(`/accounts/${accountId}/insights-metrics/${reportId}`);
  }

  // ─── Users ───

  async listUsers(accountId: string): Promise<unknown> {
    return this.request(`/accounts/${accountId}/users`);
  }

  // ─── Websites ───

  async listWebsites(accountId: string): Promise<unknown> {
    return this.request(`/accounts/${accountId}/websites`);
  }

  // ─── Drafts ───

  async listDrafts(accountId: string): Promise<unknown> {
    return this.request(`/accounts/${accountId}/drafts`);
  }

  // ─── Custom Widgets ───

  async listCustomWidgets(accountId: string): Promise<unknown> {
    return this.request(`/accounts/${accountId}/changesets`);
  }
}
