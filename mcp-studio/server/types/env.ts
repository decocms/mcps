/**
 * Environment Type Definitions
 *
 * Central definition for the Env type used throughout the workflow system.
 */

import { BindingOf, type DefaultEnv } from "@decocms/runtime";
import z from "zod";

export const StateSchema = z.object({
  DATABASE: BindingOf("@deco/postgres"),
  EVENT_BUS: BindingOf("@deco/event-bus"),
  CONNECTION: BindingOf("@deco/connection"),
  MODEL_PROVIDER: BindingOf("@deco/llm")
    .optional()
    .catch(() => undefined),
  AGENT: BindingOf("@deco/agent")
    .describe("Toolset, resources and prompts.")
    .optional()
    .catch(() => undefined),
  LANGUAGE_MODEL: z
    .object({
      __type: z.literal("@deco/language-model"),
      value: z
        .object({
          id: z.string().optional(),
        })
        .loose()
        .describe("The language model to be used."),
    })
    .optional()
    .catch(() => undefined),
});

export type Env = DefaultEnv<typeof StateSchema>;
