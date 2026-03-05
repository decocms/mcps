/**
 * Strapi API Response Types
 *
 * TypeScript interfaces for Strapi REST API responses.
 * These types provide strong typing for all Strapi API interactions.
 *
 * @see https://docs.strapi.io/dev-docs/api/rest
 */

// ========================================
// GENERIC API RESPONSE
// ========================================

/** Standard Strapi API response wrapper */
export interface StrapiResponse<T> {
  data: T;
  meta?: StrapiMeta;
}

/** Strapi pagination metadata */
export interface StrapiMeta {
  pagination?: StrapiPagination;
}

/** Strapi pagination info */
export interface StrapiPagination {
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
}

/** Common Strapi entity timestamps */
export interface StrapiTimestamps {
  createdAt: string;
  updatedAt: string;
}

// ========================================
// CONTENT TYPES
// ========================================

/** Strapi Content Type attribute */
export interface StrapiAttribute {
  type: string;
  required?: boolean;
  unique?: boolean;
  default?: unknown;
  minLength?: number;
  maxLength?: number;
  enum?: string[];
  relation?: string;
  target?: string;
  component?: string;
  repeatable?: boolean;
  pluginOptions?: Record<string, unknown>;
}

/** Strapi Content Type schema */
export interface StrapiContentTypeSchema {
  uid: string;
  apiId: string;
  category?: string;
  displayName: string;
  singularName: string;
  pluralName: string;
  description?: string;
  kind: "collectionType" | "singleType";
  draftAndPublish: boolean;
  pluginOptions?: Record<string, unknown>;
  attributes: Record<string, StrapiAttribute>;
}

// ========================================
// COMPONENTS
// ========================================

/** Strapi Component schema */
export interface StrapiComponentSchema {
  uid: string;
  category: string;
  apiId: string;
  displayName: string;
  description?: string;
  icon?: string;
  attributes: Record<string, StrapiAttribute>;
}

/** Response from GET /api/content-type-builder/components */
export interface StrapiComponentsResponse {
  data: StrapiComponentSchema[];
}

// ========================================
// i18n / LOCALIZATION
// ========================================

/** Strapi Locale */
export interface StrapiLocale extends StrapiTimestamps {
  id: number;
  name: string;
  code: string;
  isDefault: boolean;
}

/** Input for creating a locale */
export interface CreateLocaleInput {
  name: string;
  code: string;
  isDefault?: boolean;
}

// ========================================
// PUBLISH / DRAFT
// ========================================

/** Strapi publish action response (v4/v5) */
export interface StrapiPublishResponse {
  data: {
    id: number;
    documentId?: string;
    publishedAt: string | null;
    [key: string]: unknown;
  };
  meta?: Record<string, unknown>;
}

// ========================================
// BULK OPERATIONS
// ========================================

/** Strapi bulk action response */
export interface StrapiBulkActionResponse {
  count: number;
}

/** Input for bulk delete */
export interface BulkDeleteInput {
  documentIds?: string[];
  ids?: number[];
}

/** Input for bulk publish/unpublish */
export interface BulkPublishInput {
  documentIds?: string[];
  ids?: number[];
}

// ========================================
// SINGLE TYPES
// ========================================

/** Strapi Single Type response */
export interface StrapiSingleTypeResponse {
  data: {
    id: number;
    documentId?: string;
    [key: string]: unknown;
  };
  meta?: Record<string, unknown>;
}

// ========================================
// MEDIA
// ========================================

/** Strapi Media file */
export interface StrapiMediaFile extends StrapiTimestamps {
  id: number;
  name: string;
  alternativeText: string | null;
  caption: string | null;
  width?: number;
  height?: number;
  formats?: Record<string, unknown>;
  hash: string;
  ext: string;
  mime: string;
  size: number;
  url: string;
  previewUrl?: string | null;
  provider: string;
  folderPath?: string;
}

/** Strapi Media folder */
export interface StrapiMediaFolder extends StrapiTimestamps {
  id: number;
  name: string;
  pathId: number;
  path: string;
  children?: StrapiMediaFolder[];
  files?: StrapiMediaFile[];
}

// ========================================
// USERS & PERMISSIONS
// ========================================

/** Strapi User (Users & Permissions plugin) */
export interface StrapiUser extends StrapiTimestamps {
  id: number;
  username: string;
  email: string;
  provider: string;
  confirmed: boolean;
  blocked: boolean;
  role?: StrapiRole;
}

/** Strapi Role */
export interface StrapiRole {
  id: number;
  name: string;
  description: string;
  type: string;
  permissions?: StrapiPermission[];
}

/** Strapi Permission */
export interface StrapiPermission {
  id: number;
  action: string;
  enabled: boolean;
  policy?: string;
}

// ========================================
// TOOL RESPONSE HELPERS
// ========================================

/** Standard success response from a tool */
export interface ToolSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: unknown;
}

/** Standard error response from a tool */
export interface ToolErrorResponse {
  success: false;
  error: string;
}

/** Union type for tool responses */
export type ToolResponse<T = unknown> =
  | ToolSuccessResponse<T>
  | ToolErrorResponse;
