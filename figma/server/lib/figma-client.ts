import { FIGMA_API_BASE, ENDPOINTS } from "../constants.ts";
import type {
  FigmaComment,
  FigmaCommentReaction,
  FigmaComponentMeta,
  FigmaFile,
  FigmaFileMetaResponse,
  FigmaFileNodes,
  FigmaImageFillsResponse,
  FigmaImageResponse,
  FigmaPaginatedResponse,
  FigmaProject,
  FigmaProjectFile,
  FigmaStyleMeta,
  FigmaUser,
  FigmaVersion,
} from "./types.ts";

export class FigmaClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${FIGMA_API_BASE}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Figma API error ${response.status}: ${body}`);
    }

    if (response.status === 204) return {} as T;
    return response.json() as Promise<T>;
  }

  // --- File methods ---

  async getFile(
    key: string,
    params?: {
      version?: string;
      ids?: string[];
      depth?: number;
      geometry?: string;
      plugin_data?: string;
    },
  ): Promise<FigmaFile> {
    const qs = new URLSearchParams();
    if (params?.version) qs.set("version", params.version);
    if (params?.ids) qs.set("ids", params.ids.join(","));
    if (params?.depth != null) qs.set("depth", String(params.depth));
    if (params?.geometry) qs.set("geometry", params.geometry);
    if (params?.plugin_data) qs.set("plugin_data", params.plugin_data);
    const query = qs.toString();
    return this.request(`${ENDPOINTS.FILE(key)}${query ? `?${query}` : ""}`);
  }

  async getFileNodes(
    key: string,
    ids: string[],
    params?: {
      version?: string;
      depth?: number;
      geometry?: string;
      plugin_data?: string;
    },
  ): Promise<FigmaFileNodes> {
    const qs = new URLSearchParams();
    qs.set("ids", ids.join(","));
    if (params?.version) qs.set("version", params.version);
    if (params?.depth != null) qs.set("depth", String(params.depth));
    if (params?.geometry) qs.set("geometry", params.geometry);
    if (params?.plugin_data) qs.set("plugin_data", params.plugin_data);
    return this.request(`${ENDPOINTS.FILE_NODES(key)}?${qs.toString()}`);
  }

  async getImages(
    key: string,
    ids: string[],
    params?: {
      scale?: number;
      format?: string;
      svg_include_id?: boolean;
      svg_simplify_stroke?: boolean;
      use_absolute_bounds?: boolean;
    },
  ): Promise<FigmaImageResponse> {
    const qs = new URLSearchParams();
    qs.set("ids", ids.join(","));
    if (params?.scale != null) qs.set("scale", String(params.scale));
    if (params?.format) qs.set("format", params.format);
    if (params?.svg_include_id != null)
      qs.set("svg_include_id", String(params.svg_include_id));
    if (params?.svg_simplify_stroke != null)
      qs.set("svg_simplify_stroke", String(params.svg_simplify_stroke));
    if (params?.use_absolute_bounds != null)
      qs.set("use_absolute_bounds", String(params.use_absolute_bounds));
    return this.request(`${ENDPOINTS.IMAGES(key)}?${qs.toString()}`);
  }

  async getImageFills(key: string): Promise<FigmaImageFillsResponse> {
    return this.request(ENDPOINTS.IMAGE_FILLS(key));
  }

  async getFileMetadata(key: string): Promise<FigmaFileMetaResponse> {
    return this.request(ENDPOINTS.FILE_META(key));
  }

  async getFileVersions(key: string): Promise<{ versions: FigmaVersion[] }> {
    return this.request(ENDPOINTS.FILE_VERSIONS(key));
  }

  // --- Comment methods ---

  async getComments(
    fileKey: string,
    params?: { as_md?: boolean },
  ): Promise<{ comments: FigmaComment[] }> {
    const qs = new URLSearchParams();
    if (params?.as_md != null) qs.set("as_md", String(params.as_md));
    const query = qs.toString();
    return this.request(
      `${ENDPOINTS.COMMENTS(fileKey)}${query ? `?${query}` : ""}`,
    );
  }

  async postComment(
    fileKey: string,
    message: string,
    options?: {
      comment_id?: string;
      client_meta?: {
        x: number;
        y: number;
        node_id?: string;
        node_offset?: { x: number; y: number };
      };
    },
  ): Promise<FigmaComment> {
    const body: Record<string, unknown> = { message };
    if (options?.comment_id) body.comment_id = options.comment_id;
    if (options?.client_meta) body.client_meta = options.client_meta;
    return this.request(ENDPOINTS.COMMENTS(fileKey), {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async deleteComment(fileKey: string, commentId: string): Promise<void> {
    await this.request<void>(ENDPOINTS.COMMENT(fileKey, commentId), {
      method: "DELETE",
    });
  }

  async getCommentReactions(
    fileKey: string,
    commentId: string,
  ): Promise<{ reactions: FigmaCommentReaction[] }> {
    return this.request(ENDPOINTS.COMMENT_REACTIONS(fileKey, commentId));
  }

  async postCommentReaction(
    fileKey: string,
    commentId: string,
    emoji: string,
  ): Promise<FigmaCommentReaction> {
    return this.request(ENDPOINTS.COMMENT_REACTIONS(fileKey, commentId), {
      method: "POST",
      body: JSON.stringify({ emoji }),
    });
  }

  async deleteCommentReaction(
    fileKey: string,
    commentId: string,
    emoji: string,
  ): Promise<void> {
    await this.request<void>(ENDPOINTS.COMMENT_REACTIONS(fileKey, commentId), {
      method: "DELETE",
      body: JSON.stringify({ emoji }),
    });
  }

  // --- Team & Project methods ---

  async getTeamProjects(
    teamId: string,
  ): Promise<{ name: string; projects: FigmaProject[] }> {
    return this.request(ENDPOINTS.TEAM_PROJECTS(teamId));
  }

  async getProjectFiles(
    projectId: string,
  ): Promise<{ name: string; files: FigmaProjectFile[] }> {
    return this.request(ENDPOINTS.PROJECT_FILES(projectId));
  }

  async getTeamComponents(
    teamId: string,
    params?: { page_size?: number; after?: number; before?: number },
  ): Promise<FigmaPaginatedResponse<FigmaComponentMeta>> {
    const qs = new URLSearchParams();
    if (params?.page_size != null)
      qs.set("page_size", String(params.page_size));
    if (params?.after != null) qs.set("after", String(params.after));
    if (params?.before != null) qs.set("before", String(params.before));
    const query = qs.toString();
    return this.request(
      `${ENDPOINTS.TEAM_COMPONENTS(teamId)}${query ? `?${query}` : ""}`,
    );
  }

  async getTeamStyles(
    teamId: string,
    params?: { page_size?: number; after?: number; before?: number },
  ): Promise<FigmaPaginatedResponse<FigmaStyleMeta>> {
    const qs = new URLSearchParams();
    if (params?.page_size != null)
      qs.set("page_size", String(params.page_size));
    if (params?.after != null) qs.set("after", String(params.after));
    if (params?.before != null) qs.set("before", String(params.before));
    const query = qs.toString();
    return this.request(
      `${ENDPOINTS.TEAM_STYLES(teamId)}${query ? `?${query}` : ""}`,
    );
  }

  // --- User methods ---

  async whoami(): Promise<FigmaUser> {
    return this.request(ENDPOINTS.ME);
  }
}
