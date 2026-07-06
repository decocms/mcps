/**
 * YouTube Channel Admin MCP — manage a YouTube channel end-to-end.
 *
 * Google OAuth (youtube.force-ssl + youtube.upload + yt-analytics.readonly):
 * resumable uploads, thumbnails, metadata edits, captions, comment
 * moderation, analytics — plus a dashboard and home widgets (top videos,
 * performance, alerts).
 */
import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import { createGoogleOAuth } from "@decocms/mcps-shared/google-oauth";

import { GOOGLE_SCOPES } from "./constants.ts";
import {
  dashboardResource,
  widgetAlertsResource,
  widgetPerformanceResource,
  widgetTopVideosResource,
} from "./resources/index.ts";
import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";

export { StateSchema };
export type { Env };

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    state: StateSchema,
    scopes: ["OBJECT_STORAGE::GET_PRESIGNED_URL"],
  },
  oauth: createGoogleOAuth({
    scopes: GOOGLE_SCOPES,
  }),
  tools: (env: Env) => tools.map((createTool) => createTool(env)),
  resources: [
    dashboardResource,
    widgetTopVideosResource,
    widgetPerformanceResource,
    widgetAlertsResource,
  ],
});

serve(runtime.fetch);
