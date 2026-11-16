import { BindingOf, type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  OBJECT_STORAGE: BindingOf("@deco/object-storage").describe(
    "Object storage where imported Figma documents are kept.",
  ),
});

export type Env = DefaultEnv<typeof StateSchema>;
