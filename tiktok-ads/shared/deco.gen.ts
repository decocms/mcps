// Generated types for TikTok Ads MCP

import { z } from "zod";

/**
 * State schema for TikTok Ads configuration.
 * Users fill these values when installing the MCP.
 */
export const StateSchema = z.object({
  accessToken: z
    .string()
    .describe(
      "TikTok Access Token - Obtenha em TikTok Developer Portal > Tools > Access Token",
    ),
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
}

/**
 * Environment type for TikTok Ads MCP
 * Extends process env with Deco runtime context
 */
export interface Env {
  /** Deco request context containing user-configured state */
  DECO_REQUEST_CONTEXT: DecoRequestContext;
}
