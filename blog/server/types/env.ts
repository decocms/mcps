/**
 * Environment Type Definitions for Blog MCP
 */
import {
  BindingOf,
  type DefaultEnv,
  type BindingRegistry,
} from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  OBJECT_STORAGE: BindingOf("@deco/object-storage")
    .optional()
    .describe(
      "Object storage binding - select a folder with a blog/ subfolder containing articles/, tone-of-voice.md, and visual-style.md",
    ),
  IMAGE_GENERATOR: BindingOf("@deco/nanobanana")
    .optional()
    .describe("Image generation binding for cover images"),
});

export type Env = DefaultEnv<typeof StateSchema, BindingRegistry>;
