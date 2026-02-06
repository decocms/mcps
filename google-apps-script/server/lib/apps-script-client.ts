/**
 * Google Apps Script API Client
 */
import { ENDPOINTS } from "../constants.ts";
import type {
  Project,
  Content,
  CreateProjectRequest,
  UpdateContentRequest,
  Version,
  CreateVersionRequest,
  ListVersionsResponse,
  Deployment,
  CreateDeploymentRequest,
  UpdateDeploymentRequest,
  ListDeploymentsResponse,
  ExecutionRequest,
  Operation,
  ListUserProcessesResponse,
  ListScriptProcessesResponse,
  GetMetricsResponse,
  ApiError,
} from "./types.ts";
import type { Env } from "../../shared/deco.gen.ts";

export interface AppsScriptClientOptions {
  accessToken: string;
}

export class AppsScriptClient {
  private accessToken: string;

  constructor(options: AppsScriptClientOptions) {
    this.accessToken = options.accessToken;
  }

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
      const error = (await response.json()) as ApiError;
      throw new Error(
        error.error?.message ||
          `API Error: ${response.status} ${response.statusText}`,
      );
    }

    // Handle empty responses (204 No Content)
    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  // ============================================
  // Projects
  // ============================================

  /**
   * Creates a new, empty script project with no script files and a base manifest file.
   */
  async createProject(request: CreateProjectRequest): Promise<Project> {
    return this.request<Project>(ENDPOINTS.PROJECTS, {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  /**
   * Gets a script project's metadata.
   */
  async getProject(scriptId: string): Promise<Project> {
    return this.request<Project>(ENDPOINTS.PROJECT(scriptId));
  }

  /**
   * Gets the content of the script project, including the code source and metadata for each script file.
   */
  async getProjectContent(scriptId: string): Promise<Content> {
    return this.request<Content>(ENDPOINTS.PROJECT_CONTENT(scriptId));
  }

  /**
   * Updates the content of the specified script project.
   */
  async updateProjectContent(
    scriptId: string,
    request: UpdateContentRequest,
  ): Promise<Content> {
    return this.request<Content>(ENDPOINTS.PROJECT_CONTENT(scriptId), {
      method: "PUT",
      body: JSON.stringify(request),
    });
  }

  /**
   * Get metrics data for scripts.
   */
  async getProjectMetrics(
    scriptId: string,
    metricsGranularity?: "UNSPECIFIED_GRANULARITY" | "WEEKLY" | "DAILY",
    metricsFilter?: {
      deploymentId?: string;
    },
  ): Promise<GetMetricsResponse> {
    const url = new URL(ENDPOINTS.PROJECT_METRICS(scriptId));
    if (metricsGranularity) {
      url.searchParams.set("metricsGranularity", metricsGranularity);
    }
    if (metricsFilter?.deploymentId) {
      url.searchParams.set(
        "metricsFilter.deploymentId",
        metricsFilter.deploymentId,
      );
    }
    return this.request<GetMetricsResponse>(url.toString());
  }

  // ============================================
  // Scripts (Execution)
  // ============================================

  /**
   * Runs a function in an Apps Script project.
   */
  async runScript(
    scriptId: string,
    request: ExecutionRequest,
  ): Promise<Operation> {
    return this.request<Operation>(ENDPOINTS.SCRIPT_RUN(scriptId), {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  // ============================================
  // Versions
  // ============================================

  /**
   * Creates a new immutable version using the current code.
   */
  async createVersion(
    scriptId: string,
    request?: CreateVersionRequest,
  ): Promise<Version> {
    return this.request<Version>(ENDPOINTS.VERSIONS(scriptId), {
      method: "POST",
      body: JSON.stringify(request || {}),
    });
  }

  /**
   * Gets a version of a script project.
   */
  async getVersion(scriptId: string, versionNumber: number): Promise<Version> {
    return this.request<Version>(ENDPOINTS.VERSION(scriptId, versionNumber));
  }

  /**
   * List the versions of a script project.
   */
  async listVersions(
    scriptId: string,
    pageSize?: number,
    pageToken?: string,
  ): Promise<ListVersionsResponse> {
    const url = new URL(ENDPOINTS.VERSIONS(scriptId));
    if (pageSize) url.searchParams.set("pageSize", String(pageSize));
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    return this.request<ListVersionsResponse>(url.toString());
  }

  // ============================================
  // Deployments
  // ============================================

  /**
   * Creates a deployment of an Apps Script project.
   */
  async createDeployment(
    scriptId: string,
    request: CreateDeploymentRequest,
  ): Promise<Deployment> {
    return this.request<Deployment>(ENDPOINTS.DEPLOYMENTS(scriptId), {
      method: "POST",
      body: JSON.stringify({
        versionNumber: request.versionNumber,
        manifestFileName: request.manifestFileName,
        description: request.description,
      }),
    });
  }

  /**
   * Gets a deployment of an Apps Script project.
   */
  async getDeployment(
    scriptId: string,
    deploymentId: string,
  ): Promise<Deployment> {
    return this.request<Deployment>(
      ENDPOINTS.DEPLOYMENT(scriptId, deploymentId),
    );
  }

  /**
   * Lists the deployments of an Apps Script project.
   */
  async listDeployments(
    scriptId: string,
    pageSize?: number,
    pageToken?: string,
  ): Promise<ListDeploymentsResponse> {
    const url = new URL(ENDPOINTS.DEPLOYMENTS(scriptId));
    if (pageSize) url.searchParams.set("pageSize", String(pageSize));
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    return this.request<ListDeploymentsResponse>(url.toString());
  }

  /**
   * Updates a deployment of an Apps Script project.
   */
  async updateDeployment(
    scriptId: string,
    deploymentId: string,
    request: UpdateDeploymentRequest,
  ): Promise<Deployment> {
    return this.request<Deployment>(
      ENDPOINTS.DEPLOYMENT(scriptId, deploymentId),
      {
        method: "PUT",
        body: JSON.stringify(request),
      },
    );
  }

  /**
   * Deletes a deployment of an Apps Script project.
   */
  async deleteDeployment(
    scriptId: string,
    deploymentId: string,
  ): Promise<void> {
    await this.request<void>(ENDPOINTS.DEPLOYMENT(scriptId, deploymentId), {
      method: "DELETE",
    });
  }

  // ============================================
  // Processes
  // ============================================

  /**
   * List information about processes made by or on behalf of a user.
   */
  async listUserProcesses(options?: {
    pageSize?: number;
    pageToken?: string;
    userProcessFilter?: {
      scriptId?: string;
      deploymentId?: string;
      projectName?: string;
      functionName?: string;
      startTime?: string;
      endTime?: string;
      types?: string[];
      statuses?: string[];
    };
  }): Promise<ListUserProcessesResponse> {
    const url = new URL(ENDPOINTS.PROCESSES);
    if (options?.pageSize) {
      url.searchParams.set("pageSize", String(options.pageSize));
    }
    if (options?.pageToken) {
      url.searchParams.set("pageToken", options.pageToken);
    }
    if (options?.userProcessFilter) {
      const filter = options.userProcessFilter;
      if (filter.scriptId) {
        url.searchParams.set("userProcessFilter.scriptId", filter.scriptId);
      }
      if (filter.deploymentId) {
        url.searchParams.set(
          "userProcessFilter.deploymentId",
          filter.deploymentId,
        );
      }
      if (filter.projectName) {
        url.searchParams.set(
          "userProcessFilter.projectName",
          filter.projectName,
        );
      }
      if (filter.functionName) {
        url.searchParams.set(
          "userProcessFilter.functionName",
          filter.functionName,
        );
      }
      if (filter.startTime) {
        url.searchParams.set("userProcessFilter.startTime", filter.startTime);
      }
      if (filter.endTime) {
        url.searchParams.set("userProcessFilter.endTime", filter.endTime);
      }
      if (filter.types?.length) {
        filter.types.forEach((t) =>
          url.searchParams.append("userProcessFilter.types", t),
        );
      }
      if (filter.statuses?.length) {
        filter.statuses.forEach((s) =>
          url.searchParams.append("userProcessFilter.statuses", s),
        );
      }
    }
    return this.request<ListUserProcessesResponse>(url.toString());
  }

  /**
   * List information about a script's executed processes.
   */
  async listScriptProcesses(
    scriptId: string,
    options?: {
      pageSize?: number;
      pageToken?: string;
      scriptProcessFilter?: {
        deploymentId?: string;
        functionName?: string;
        startTime?: string;
        endTime?: string;
        types?: string[];
        statuses?: string[];
        userAccessLevels?: string[];
      };
    },
  ): Promise<ListScriptProcessesResponse> {
    const url = new URL(ENDPOINTS.SCRIPT_PROCESSES(scriptId));
    if (options?.pageSize) {
      url.searchParams.set("pageSize", String(options.pageSize));
    }
    if (options?.pageToken) {
      url.searchParams.set("pageToken", options.pageToken);
    }
    if (options?.scriptProcessFilter) {
      const filter = options.scriptProcessFilter;
      if (filter.deploymentId) {
        url.searchParams.set(
          "scriptProcessFilter.deploymentId",
          filter.deploymentId,
        );
      }
      if (filter.functionName) {
        url.searchParams.set(
          "scriptProcessFilter.functionName",
          filter.functionName,
        );
      }
      if (filter.startTime) {
        url.searchParams.set("scriptProcessFilter.startTime", filter.startTime);
      }
      if (filter.endTime) {
        url.searchParams.set("scriptProcessFilter.endTime", filter.endTime);
      }
      if (filter.types?.length) {
        filter.types.forEach((t) =>
          url.searchParams.append("scriptProcessFilter.types", t),
        );
      }
      if (filter.statuses?.length) {
        filter.statuses.forEach((s) =>
          url.searchParams.append("scriptProcessFilter.statuses", s),
        );
      }
      if (filter.userAccessLevels?.length) {
        filter.userAccessLevels.forEach((l) =>
          url.searchParams.append("scriptProcessFilter.userAccessLevels", l),
        );
      }
    }
    return this.request<ListScriptProcessesResponse>(url.toString());
  }
}

/**
 * Get Google OAuth access token (without Bearer prefix)
 */
export const getAccessToken = (env: Env): string => {
  const authorization = env.MESH_REQUEST_CONTEXT?.authorization;
  if (!authorization) {
    throw new Error(
      "Not authenticated. Please authorize with Google Apps Script first.",
    );
  }
  // Remove "Bearer " prefix if present to avoid double prefix in client
  return authorization.replace(/^Bearer\s+/i, "");
};
