/**
 * Environment Type Definitions
 *
 * Central definition for the Env type used throughout the workflow system.
 */

import type { Registry } from "@decocms/mcps-shared/registry";
import { BindingOf, type DefaultEnv } from "@decocms/runtime";
import z from "zod";

export const StateSchema = z.object({
  DATABASE: BindingOf("@deco/postgres"),
  EVENT_BUS: BindingOf("@deco/event-bus"),
  CONNECTION: BindingOf("@deco/connection"),
  MODEL_PROVIDER: BindingOf("@deco/llm"),
  AGENT: BindingOf("@deco/agent").describe("Toolset, resources and prompts."),
  LANGUAGE_MODEL: z.object({
    __type: z.literal("@deco/language-model"),
    value: z
      .object({
        id: z.string(),
      })
      .loose()
      .describe("The language model to be used."),
  }),
});

export type Env = DefaultEnv<typeof StateSchema, Registry>;
export type { Registry };
