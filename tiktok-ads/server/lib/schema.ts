import { z } from "zod";

/**
 * State schema for TikTok Ads configuration.
 * Users fill these values when installing the MCP.
 */
export const StateSchema = z.object({
  // TikTok App Credentials
  TIKTOK_CREDENTIALS: z
    .object({
      accessToken: z
        .string()
        .describe(
          "TikTok Access Token - Obtenha em TikTok Developer Portal > Tools > Access Token",
        ),
    })
    .describe("TikTok App credentials from business-api.tiktok.com"),

  // General Configuration
  CONFIG: z
    .object({
      DEFAULT_ADVERTISER_ID: z
        .string()
        .optional()
        .describe("Default Advertiser ID to use in tools if not provided"),
    })
    .optional()
    .describe("General configuration settings"),
});

/**
 * Inferred state type from the schema
 */
export type State = z.infer<typeof StateSchema>;

/**
 * Deco request context injected by the Deco runtime
 * Contains the state filled by user during installation
 */
export interface DecoRequestContext {
  /** State filled by user during MCP installation */
  state: State;
  meshUrl?: string;
  connectionId?: string;
  token?: string;
  organizationId?: string;
}

/**
 * Environment type for TikTok Ads MCP
 * Extends process env with Deco runtime context
 */
export interface Env {
  /** Deco request context containing user-configured state */
  DECO_REQUEST_CONTEXT?: DecoRequestContext;
  /** Mesh request context (used in some versions) */
  MESH_REQUEST_CONTEXT?: DecoRequestContext & {
    meshUrl?: string;
    connectionId?: string;
    token?: string;
    organizationId?: string;
  };
}
