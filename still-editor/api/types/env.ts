import { BindingOf, type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const DEFAULT_MODELS = [
  "openai/gpt-image-2.6-sunburst",
  "google/gemini-nano-banana-2.1",
  "google/gemini-3-pro-image",
  "bytedance-seed/seedream-5-0-pro",
];

export const StateSchema = z.object({
  WAKE: BindingOf("@deco/wake").describe(
    "Wake connection of the store, with an admin token that can write product images.",
  ),
  OBJECT_STORAGE: BindingOf("@deco/object-storage").describe(
    "Storage for edit versions, backups and the publication log.",
  ),
  STILL_ORDER: z
    .number()
    .int()
    .min(0)
    .default(85)
    .describe(
      "Image order (ordem) that marks a product's Still in Wake. The storefront hides it from the gallery.",
    ),
  TOP_CATEGORY_IDS: z
    .array(z.number().int())
    .default([])
    .describe("Wake category ids of tops"),
  BOTTOM_CATEGORY_IDS: z
    .array(z.number().int())
    .default([])
    .describe("Wake category ids of bottoms (briefs, hotpants)"),
  STORAGE_PREFIX: z
    .string()
    .default("still-editor")
    .describe(
      "Storage folder. The backdrop plate must be at <prefix>/assets/plate.png (1600×2000, already blurred).",
    ),
  DEFAULT_MODEL: z.string().default(DEFAULT_MODELS[0]),
  MODELS: z
    .array(z.string())
    .default(DEFAULT_MODELS)
    .describe(
      "Image models offered in the editor, OpenRouter ids. They run on the image tier's key in Studio's AI providers.",
    ),
});

export type Env = DefaultEnv<typeof StateSchema>;

const SettingsSchema = StateSchema.omit({
  WAKE: true,
  OBJECT_STORAGE: true,
});

type Settings = z.infer<typeof SettingsSchema>;

/**
 * The connection's settings, with defaults for fields it never saved: the
 * runtime hands over the stored state without applying the schema.
 */
export const settings = (env: Env): Settings =>
  SettingsSchema.parse(env.MESH_REQUEST_CONTEXT.state);
