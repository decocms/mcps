/**
 * GitHub API Client
 *
 * Handles communication with GitHub API for:
 * - Webhook registration (repo and org level)
 * - Repository listing
 *
 * Uses OAuth access tokens obtained via the GitHub App OAuth flow.
 */

import { Octokit } from "@octokit/rest";
import type { GitHubWebhookEvent } from "../types/env.ts";

export interface WebhookConfig {
  /** Repository owner (username or org) */
  owner: string;
  /** Repository name */
  repo: string;
  /** Webhook URL to receive events */
  url: string;
  /** Events to subscribe to */
  events: GitHubWebhookEvent[];
  /** Content type for webhook payload */
  contentType?: "json" | "form";
  /** Webhook secret for signature validation (optional) */
  secret?: string;
}

export interface OrgWebhookConfig {
  /** Organization name */
  org: string;
  /** Webhook URL to receive events */
  url: string;
  /** Events to subscribe to */
  events: GitHubWebhookEvent[];
  /** Content type for webhook payload */
  contentType?: "json" | "form";
  /** Webhook secret for signature validation (optional) */
  secret?: string;
}

export interface Webhook {
  id: number;
  url: string;
  active: boolean;
  events: string[];
  config: {
    url?: string;
    content_type?: string;
  };
}

export interface Repository {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
  };
  private: boolean;
  html_url: string;
  description: string | null;
  default_branch: string;
}

/**
 * GitHub API client for managing webhooks and repositories
 */
export class GitHubClient {
  private octokit: Octokit;

  constructor(accessToken: string) {
    this.octokit = new Octokit({ auth: accessToken });
  }

  /**
   * Create a client from an access token
   */
  static for(accessToken: string): GitHubClient {
    return new GitHubClient(accessToken);
  }

  // ============================================================================
  // Repository Methods
  // ============================================================================

  /**
   * List repositories accessible to the installation
   */
  async listRepositories(): Promise<Repository[]> {
    const response = await this.octokit.apps.listReposAccessibleToInstallation({
      per_page: 100,
    });

    return response.data.repositories as Repository[];
  }

  /**
   * Get a specific repository
   */
  async getRepository(owner: string, repo: string): Promise<Repository> {
    const response = await this.octokit.repos.get({ owner, repo });
    return response.data as Repository;
  }

  // ============================================================================
  // Repository Webhook Methods
  // ============================================================================

  /**
   * List webhooks for a repository
   */
  async listWebhooks(owner: string, repo: string): Promise<Webhook[]> {
    const response = await this.octokit.repos.listWebhooks({ owner, repo });
    return response.data as Webhook[];
  }

  /**
   * Create a webhook for a repository
   */
  async createWebhook(config: WebhookConfig): Promise<Webhook> {
    const response = await this.octokit.repos.createWebhook({
      owner: config.owner,
      repo: config.repo,
      config: {
        url: config.url,
        content_type: config.contentType || "json",
        secret: config.secret,
      },
      events: config.events,
      active: true,
    });

    return response.data as Webhook;
  }

  /**
   * Update an existing repository webhook
   */
  async updateWebhook(
    owner: string,
    repo: string,
    hookId: number,
    config: WebhookConfig,
  ): Promise<Webhook> {
    const response = await this.octokit.repos.updateWebhook({
      owner,
      repo,
      hook_id: hookId,
      config: {
        url: config.url,
        content_type: config.contentType || "json",
        secret: config.secret,
      },
      events: config.events,
      active: true,
    });

    return response.data as Webhook;
  }

  /**
   * Delete a repository webhook
   */
  async deleteWebhook(
    owner: string,
    repo: string,
    hookId: number,
  ): Promise<void> {
    await this.octokit.repos.deleteWebhook({ owner, repo, hook_id: hookId });
  }

  /**
   * Find a repository webhook by URL
   */
  async findWebhookByUrl(
    owner: string,
    repo: string,
    url: string,
  ): Promise<Webhook | null> {
    const webhooks = await this.listWebhooks(owner, repo);
    return webhooks.find((hook) => hook.config.url === url) || null;
  }

  /**
   * Create or update a repository webhook (idempotent)
   */
  async upsertWebhook(config: WebhookConfig): Promise<Webhook> {
    const existing = await this.findWebhookByUrl(
      config.owner,
      config.repo,
      config.url,
    );

    if (existing) {
      console.log(
        `[GitHub] Updating existing webhook ${existing.id} for ${config.owner}/${config.repo}`,
      );
      return this.updateWebhook(config.owner, config.repo, existing.id, config);
    }

    console.log(
      `[GitHub] Creating new webhook for ${config.owner}/${config.repo}`,
    );
    return this.createWebhook(config);
  }

  // ============================================================================
  // Organization Webhook Methods
  // ============================================================================

  /**
   * List webhooks for an organization
   */
  async listOrgWebhooks(org: string): Promise<Webhook[]> {
    const response = await this.octokit.orgs.listWebhooks({ org });
    return response.data as Webhook[];
  }

  /**
   * Create a webhook for an organization (receives events from all repos)
   */
  async createOrgWebhook(config: OrgWebhookConfig): Promise<Webhook> {
    const response = await this.octokit.orgs.createWebhook({
      org: config.org,
      name: "web",
      config: {
        url: config.url,
        content_type: config.contentType || "json",
        secret: config.secret,
      },
      events: config.events,
      active: true,
    });

    return response.data as Webhook;
  }

  /**
   * Update an existing organization webhook
   */
  async updateOrgWebhook(
    org: string,
    hookId: number,
    config: OrgWebhookConfig,
  ): Promise<Webhook> {
    const response = await this.octokit.orgs.updateWebhook({
      org,
      hook_id: hookId,
      config: {
        url: config.url,
        content_type: config.contentType || "json",
        secret: config.secret,
      },
      events: config.events,
      active: true,
    });

    return response.data as Webhook;
  }

  /**
   * Delete an organization webhook
   */
  async deleteOrgWebhook(org: string, hookId: number): Promise<void> {
    await this.octokit.orgs.deleteWebhook({ org, hook_id: hookId });
  }

  /**
   * Find an organization webhook by URL
   */
  async findOrgWebhookByUrl(org: string, url: string): Promise<Webhook | null> {
    const webhooks = await this.listOrgWebhooks(org);
    return webhooks.find((hook) => hook.config.url === url) || null;
  }

  /**
   * Create or update an organization webhook (idempotent)
   */
  async upsertOrgWebhook(config: OrgWebhookConfig): Promise<Webhook> {
    const existing = await this.findOrgWebhookByUrl(config.org, config.url);

    if (existing) {
      console.log(
        `[GitHub] Updating existing org webhook ${existing.id} for ${config.org}`,
      );
      return this.updateOrgWebhook(config.org, existing.id, config);
    }

    console.log(`[GitHub] Creating new org webhook for ${config.org}`);
    return this.createOrgWebhook(config);
  }
}

/**
 * Exchange an OAuth code for an access token
 *
 * This is used during the GitHub App OAuth flow to exchange
 * the authorization code for an installation access token.
 */
export async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<{ access_token: string; token_type: string }> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub OAuth failed: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    token_type: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (data.error) {
    throw new Error(
      `GitHub OAuth error: ${data.error_description || data.error}`,
    );
  }

  return {
    access_token: data.access_token,
    token_type: data.token_type || "Bearer",
  };
}
