import { BindingOf, type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  OPENROUTER: BindingOf("@deco/openrouter").describe(
    "OpenRouter connection. Its account pays for the image models.",
  ),
  WAKE: BindingOf("@deco/wake").describe(
    "Wake connection of the store, with an admin token that can write product images.",
  ),
  OBJECT_STORAGE: BindingOf("@deco/object-storage").describe(
    "Storage for edit versions, backups and the publication log.",
  ),
});

export type Env = DefaultEnv<typeof StateSchema>;
