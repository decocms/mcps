// Generated types for Perplexity MCP

import { z } from "zod";

/**
 * Mesh request context injected by the Deco runtime
 * Contains authentication and metadata for the current request
 */
export interface MeshRequestContext {
  /** Bearer token from Authorization header */
  authorization?: string;
  /** Comma-separated list of valid API keys for authentication */
  apiKeys?: string;
  /** Internal state for OAuth flow */
  state?: string;
  /** JWT token for the request */
  token?: string;
  /** URL of the mesh server */
  meshUrl?: string;
  /** Connection ID for this session */
  connectionId?: string;
  /** Function to ensure user is authenticated */
  ensureAuthenticated?: () => Promise<void>;
}

/**
 * Environment type for Perplexity MCP
 * Extends process env with Deco runtime context
 */
export interface Env {
  /** Mesh request context injected by runtime */
  MESH_REQUEST_CONTEXT: MeshRequestContext;
  /** Self-reference MCP (if needed) */
  SELF?: unknown;
  /** Whether running locally */
  IS_LOCAL?: boolean;
}

/**
 * State schema for validation (empty since we don't use OAuth form)
 */
export const StateSchema = z.object({});
