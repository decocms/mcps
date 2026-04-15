export const FIGMA_API_BASE = "https://api.figma.com";

export const ENDPOINTS = {
  // Files
  FILE: (key: string) => `/v1/files/${key}`,
  FILE_NODES: (key: string) => `/v1/files/${key}/nodes`,
  IMAGES: (key: string) => `/v1/images/${key}`,
  IMAGE_FILLS: (key: string) => `/v1/files/${key}/images`,
  FILE_META: (key: string) => `/v1/files/${key}/meta`,
  FILE_VERSIONS: (key: string) => `/v1/files/${key}/versions`,

  // Comments
  COMMENTS: (fileKey: string) => `/v1/files/${fileKey}/comments`,
  COMMENT: (fileKey: string, commentId: string) =>
    `/v1/files/${fileKey}/comments/${commentId}`,
  COMMENT_REACTIONS: (fileKey: string, commentId: string) =>
    `/v1/files/${fileKey}/comments/${commentId}/reactions`,

  // Teams & Projects
  TEAM_PROJECTS: (teamId: string) => `/v1/teams/${teamId}/projects`,
  PROJECT_FILES: (projectId: string) => `/v1/projects/${projectId}/files`,

  // Components & Styles
  TEAM_COMPONENTS: (teamId: string) => `/v1/teams/${teamId}/components`,
  TEAM_STYLES: (teamId: string) => `/v1/teams/${teamId}/styles`,

  // User
  ME: "/v1/me",
};

export const FIGMA_SCOPES = [
  "files:read",
  "file_comments:write",
  "file_dev_resources:read",
  "library_content:read",
];
