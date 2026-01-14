// Generated types for Google Sheets MCP

import { z } from "zod";

export interface MeshRequestContext {
  authorization?: string;
  state?: string;
  token?: string;
  meshUrl?: string;
  connectionId?: string;
  ensureAuthenticated?: () => Promise<void>;
}

export interface Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  MESH_REQUEST_CONTEXT: MeshRequestContext;
  SELF?: unknown;
  IS_LOCAL?: boolean;
}

export const StateSchema = z.object({});
