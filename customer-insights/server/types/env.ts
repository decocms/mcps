/**
 * Environment Types & State Schema
 *
 * Defines the runtime environment type and the MCP state schema.
 * Integrations:
 * - GOOGLE_CONFIG: OAuth tokens for Gmail access (state — per-user OAuth)
 *
 * Note: Airtable credentials are server-level configuration and are therefore
 * read from environment variables (AIRTABLE_API_KEY, AIRTABLE_VIEW_URL),
 * not from MCP state.
 */

import type { DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  GOOGLE_CONFIG: z

    .object({
      access_token: z

        .string()

        .describe("Google OAuth access token with gmail.readonly scope."),
      refresh_token: z

        .string()

        .optional()

        .describe(
          "Google OAuth refresh token for automatic renewal (optional).",
        ),
    })

    .optional()

    .describe(
      "Google OAuth tokens for Gmail integration (customer_emails_get tool).",
    ),
});

export type Env = DefaultEnv<typeof StateSchema>;
