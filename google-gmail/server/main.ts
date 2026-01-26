/**
 * Gmail MCP Server
 *
 * This MCP provides tools for interacting with Gmail API,
 * including message management, thread operations, labels, and drafts.
 */
import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import {
  createGoogleOAuth,
  GOOGLE_SCOPES,
} from "@decocms/mcps-shared/google-oauth";

import { tools } from "./tools/index.ts";
import type { Env } from "../shared/deco.gen.ts";

export type { Env };

const runtime = withRuntime<Env>({
  tools: (env: Env) => tools.map((createTool) => createTool(env)),
  oauth: createGoogleOAuth({
    scopes: [
      GOOGLE_SCOPES.GMAIL_READONLY,
      GOOGLE_SCOPES.GMAIL_SEND,
      GOOGLE_SCOPES.GMAIL_MODIFY,
      GOOGLE_SCOPES.GMAIL_LABELS,
    ],
  }),
});

serve(runtime.fetch);
