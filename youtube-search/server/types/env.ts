import { BindingOf, type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

/**
 * Installation-time configuration.
 *
 * Everything in this MCP is keyless (Innertube) — the only optional piece
 * is object storage, required by YOUTUBE_DOWNLOAD_VIDEO to deliver files
 * (raw googlevideo URLs are IP-locked to this server and useless to users).
 */
export const StateSchema = z.object({
  OBJECT_STORAGE: BindingOf("@deco/object-storage")
    .optional()
    .describe(
      "Object storage (S3-compatible) where downloaded videos/audio are saved. Required only by the download tool.",
    ),
});

export type Env = DefaultEnv<typeof StateSchema>;
