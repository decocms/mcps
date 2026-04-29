export interface FigmaUser {
  id: string;
  handle: string;
  img_url: string;
  email: string;
}

export interface FigmaFile {
  name: string;
  role: string;
  lastModified: string;
  editorType: string;
  thumbnailUrl: string;
  version: string;
  document: Record<string, unknown>;
  components: Record<string, unknown>;
  componentSets: Record<string, unknown>;
  schemaVersion: number;
  styles: Record<string, unknown>;
  mainFileKey?: string;
}

export interface FigmaFileNodes {
  name: string;
  role: string;
  lastModified: string;
  thumbnailUrl: string;
  version: string;
  nodes: Record<
    string,
    {
      document: Record<string, unknown>;
      components: Record<string, unknown>;
      styles: Record<string, unknown>;
    } | null
  >;
}

export interface FigmaImageResponse {
  err: string | null;
  images: Record<string, string | null>;
}

export interface FigmaImageFillsResponse {
  error: boolean;
  status: number;
  meta: {
    images: Record<string, string>;
  };
}

export interface FigmaFileMetaResponse {
  file: {
    key: string;
    name: string;
    thumbnail_url: string;
    last_modified: string;
    version: string;
    role: string;
    editor_type: string;
    link_access: string;
    folder_name?: string;
    creator?: FigmaUser;
  };
}

export interface FigmaComment {
  id: string;
  file_key: string;
  parent_id: string;
  user: FigmaUser;
  created_at: string;
  resolved_at: string | null;
  message: string;
  client_meta: {
    x?: number;
    y?: number;
    node_id?: string;
    node_offset?: { x: number; y: number };
  } | null;
  order_id: string;
  reactions: FigmaCommentReaction[];
}

export interface FigmaCommentReaction {
  emoji: string;
  user: FigmaUser;
  created_at: string;
}

export interface FigmaVersion {
  id: string;
  created_at: string;
  label: string;
  description: string;
  user: FigmaUser;
}

export interface FigmaProject {
  id: number;
  name: string;
}

export interface FigmaProjectFile {
  key: string;
  name: string;
  thumbnail_url: string;
  last_modified: string;
}

export interface FigmaComponentMeta {
  key: string;
  file_key: string;
  node_id: string;
  thumbnail_url: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  containing_frame: {
    name: string;
    nodeId: string;
    pageId: string;
    pageName: string;
  };
}

export interface FigmaStyleMeta {
  key: string;
  file_key: string;
  node_id: string;
  style_type: string;
  thumbnail_url: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  sort_position: string;
}

export interface FigmaPaginatedResponse<T> {
  status: number;
  error: boolean;
  meta: {
    components?: T[];
    styles?: T[];
    cursor: Record<string, number>;
  };
}
