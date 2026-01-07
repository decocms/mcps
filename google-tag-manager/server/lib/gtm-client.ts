/**
 * Google Tag Manager API client
 * Handles all communication with the Google Tag Manager API v2
 */

import { ENDPOINTS } from "../constants.ts";
import type {
  Account,
  AccountsListResponse,
  Container,
  ContainersListResponse,
  Workspace,
  WorkspacesListResponse,
  Tag,
  TagsListResponse,
  Trigger,
  TriggersListResponse,
  Variable,
  VariablesListResponse,
  CreateContainerInput,
  CreateWorkspaceInput,
  CreateTagInput,
  UpdateTagInput,
  CreateTriggerInput,
  UpdateTriggerInput,
  CreateVariableInput,
  UpdateVariableInput,
} from "./types.ts";

export interface GTMClientConfig {
  accessToken: string;
}

export class GTMClient {
  private accessToken: string;

  constructor(config: GTMClientConfig) {
    this.accessToken = config.accessToken;
  }

  /**
   * Make a request to the GTM API
   */
  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Google Tag Manager API error: ${response.status} - ${error}`,
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  }

  // ==================== Account Methods ====================

  /**
   * List all accessible accounts
   */
  async listAccounts(pageToken?: string): Promise<AccountsListResponse> {
    const url = new URL(ENDPOINTS.ACCOUNTS);
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    return this.request<AccountsListResponse>(url.toString());
  }

  /**
   * Get a specific account
   */
  async getAccount(accountId: string): Promise<Account> {
    return this.request<Account>(ENDPOINTS.ACCOUNT(accountId));
  }

  // ==================== Container Methods ====================

  /**
   * List containers in an account
   */
  async listContainers(
    accountId: string,
    pageToken?: string,
  ): Promise<ContainersListResponse> {
    const url = new URL(ENDPOINTS.CONTAINERS(accountId));
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    return this.request<ContainersListResponse>(url.toString());
  }

  /**
   * Get a specific container
   */
  async getContainer(
    accountId: string,
    containerId: string,
  ): Promise<Container> {
    return this.request<Container>(ENDPOINTS.CONTAINER(accountId, containerId));
  }

  /**
   * Create a new container
   */
  async createContainer(
    accountId: string,
    input: CreateContainerInput,
  ): Promise<Container> {
    return this.request<Container>(ENDPOINTS.CONTAINERS(accountId), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  /**
   * Delete a container
   */
  async deleteContainer(accountId: string, containerId: string): Promise<void> {
    await this.request<void>(ENDPOINTS.CONTAINER(accountId, containerId), {
      method: "DELETE",
    });
  }

  // ==================== Workspace Methods ====================

  /**
   * List workspaces in a container
   */
  async listWorkspaces(
    accountId: string,
    containerId: string,
    pageToken?: string,
  ): Promise<WorkspacesListResponse> {
    const url = new URL(ENDPOINTS.WORKSPACES(accountId, containerId));
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    return this.request<WorkspacesListResponse>(url.toString());
  }

  /**
   * Get a specific workspace
   */
  async getWorkspace(
    accountId: string,
    containerId: string,
    workspaceId: string,
  ): Promise<Workspace> {
    return this.request<Workspace>(
      ENDPOINTS.WORKSPACE(accountId, containerId, workspaceId),
    );
  }

  /**
   * Create a new workspace
   */
  async createWorkspace(
    accountId: string,
    containerId: string,
    input: CreateWorkspaceInput,
  ): Promise<Workspace> {
    return this.request<Workspace>(
      ENDPOINTS.WORKSPACES(accountId, containerId),
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  /**
   * Delete a workspace
   */
  async deleteWorkspace(
    accountId: string,
    containerId: string,
    workspaceId: string,
  ): Promise<void> {
    await this.request<void>(
      ENDPOINTS.WORKSPACE(accountId, containerId, workspaceId),
      {
        method: "DELETE",
      },
    );
  }

  // ==================== Tag Methods ====================

  /**
   * List tags in a workspace
   */
  async listTags(
    accountId: string,
    containerId: string,
    workspaceId: string,
    pageToken?: string,
  ): Promise<TagsListResponse> {
    const url = new URL(ENDPOINTS.TAGS(accountId, containerId, workspaceId));
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    return this.request<TagsListResponse>(url.toString());
  }

  /**
   * Get a specific tag
   */
  async getTag(
    accountId: string,
    containerId: string,
    workspaceId: string,
    tagId: string,
  ): Promise<Tag> {
    return this.request<Tag>(
      ENDPOINTS.TAG(accountId, containerId, workspaceId, tagId),
    );
  }

  /**
   * Create a new tag
   */
  async createTag(
    accountId: string,
    containerId: string,
    workspaceId: string,
    input: CreateTagInput,
  ): Promise<Tag> {
    return this.request<Tag>(
      ENDPOINTS.TAGS(accountId, containerId, workspaceId),
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  /**
   * Update an existing tag
   */
  async updateTag(
    accountId: string,
    containerId: string,
    workspaceId: string,
    tagId: string,
    input: UpdateTagInput,
  ): Promise<Tag> {
    return this.request<Tag>(
      ENDPOINTS.TAG(accountId, containerId, workspaceId, tagId),
      {
        method: "PUT",
        body: JSON.stringify(input),
      },
    );
  }

  /**
   * Delete a tag
   */
  async deleteTag(
    accountId: string,
    containerId: string,
    workspaceId: string,
    tagId: string,
  ): Promise<void> {
    await this.request<void>(
      ENDPOINTS.TAG(accountId, containerId, workspaceId, tagId),
      {
        method: "DELETE",
      },
    );
  }

  // ==================== Trigger Methods ====================

  /**
   * List triggers in a workspace
   */
  async listTriggers(
    accountId: string,
    containerId: string,
    workspaceId: string,
    pageToken?: string,
  ): Promise<TriggersListResponse> {
    const url = new URL(
      ENDPOINTS.TRIGGERS(accountId, containerId, workspaceId),
    );
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    return this.request<TriggersListResponse>(url.toString());
  }

  /**
   * Get a specific trigger
   */
  async getTrigger(
    accountId: string,
    containerId: string,
    workspaceId: string,
    triggerId: string,
  ): Promise<Trigger> {
    return this.request<Trigger>(
      ENDPOINTS.TRIGGER(accountId, containerId, workspaceId, triggerId),
    );
  }

  /**
   * Create a new trigger
   */
  async createTrigger(
    accountId: string,
    containerId: string,
    workspaceId: string,
    input: CreateTriggerInput,
  ): Promise<Trigger> {
    return this.request<Trigger>(
      ENDPOINTS.TRIGGERS(accountId, containerId, workspaceId),
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  /**
   * Update an existing trigger
   */
  async updateTrigger(
    accountId: string,
    containerId: string,
    workspaceId: string,
    triggerId: string,
    input: UpdateTriggerInput,
  ): Promise<Trigger> {
    return this.request<Trigger>(
      ENDPOINTS.TRIGGER(accountId, containerId, workspaceId, triggerId),
      {
        method: "PUT",
        body: JSON.stringify(input),
      },
    );
  }

  /**
   * Delete a trigger
   */
  async deleteTrigger(
    accountId: string,
    containerId: string,
    workspaceId: string,
    triggerId: string,
  ): Promise<void> {
    await this.request<void>(
      ENDPOINTS.TRIGGER(accountId, containerId, workspaceId, triggerId),
      {
        method: "DELETE",
      },
    );
  }

  // ==================== Variable Methods ====================

  /**
   * List variables in a workspace
   */
  async listVariables(
    accountId: string,
    containerId: string,
    workspaceId: string,
    pageToken?: string,
  ): Promise<VariablesListResponse> {
    const url = new URL(
      ENDPOINTS.VARIABLES(accountId, containerId, workspaceId),
    );
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    return this.request<VariablesListResponse>(url.toString());
  }

  /**
   * Get a specific variable
   */
  async getVariable(
    accountId: string,
    containerId: string,
    workspaceId: string,
    variableId: string,
  ): Promise<Variable> {
    return this.request<Variable>(
      ENDPOINTS.VARIABLE(accountId, containerId, workspaceId, variableId),
    );
  }

  /**
   * Create a new variable
   */
  async createVariable(
    accountId: string,
    containerId: string,
    workspaceId: string,
    input: CreateVariableInput,
  ): Promise<Variable> {
    return this.request<Variable>(
      ENDPOINTS.VARIABLES(accountId, containerId, workspaceId),
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  /**
   * Update an existing variable
   */
  async updateVariable(
    accountId: string,
    containerId: string,
    workspaceId: string,
    variableId: string,
    input: UpdateVariableInput,
  ): Promise<Variable> {
    return this.request<Variable>(
      ENDPOINTS.VARIABLE(accountId, containerId, workspaceId, variableId),
      {
        method: "PUT",
        body: JSON.stringify(input),
      },
    );
  }

  /**
   * Delete a variable
   */
  async deleteVariable(
    accountId: string,
    containerId: string,
    workspaceId: string,
    variableId: string,
  ): Promise<void> {
    await this.request<void>(
      ENDPOINTS.VARIABLE(accountId, containerId, workspaceId, variableId),
      {
        method: "DELETE",
      },
    );
  }
}

// Re-export getGoogleAccessToken from env.ts for convenience
export { getGoogleAccessToken as getAccessToken } from "./env.ts";
