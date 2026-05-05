import type { DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  CRAZY_EGG_TRACKING_KEY: z
    .string()
    .optional()
    .describe(
      "Per-site Conversion Tracking API key. Found in your Crazy Egg dashboard at Site Settings → API. Required only for the track_conversion tool.",
    ),
  CRAZY_EGG_API_KEY: z
    .string()
    .optional()
    .describe(
      "Account-wide API key from app.crazyegg.com/options/api (Pro plan). Required for read tools (snapshots, recordings, A/B tests, funnels, surveys).",
    ),
  CRAZY_EGG_APP_KEY: z
    .string()
    .optional()
    .describe(
      "Account-wide App Key (secret) paired with the API key, from app.crazyegg.com/options/api. Used as the HMAC-SHA256 signing key for v2 requests. ⚠️ Treat as a secret.",
    ),
});

export type Env = DefaultEnv<typeof StateSchema>;
