import { BindingOf, type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  OBJECT_STORAGE: BindingOf("@deco/object-storage")
    .optional()
    .describe(
      "Object storage (S3-compatible). Lets YOUTUBE_ADMIN_UPLOAD_VIDEO read video files by storageKey (e.g. files saved by the youtube-search MCP).",
    ),
});

export type Env = DefaultEnv<typeof StateSchema>;
