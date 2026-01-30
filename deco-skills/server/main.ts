/**
 * deco-skills MCP
 *
 * Provides access to deco's brand guidelines, writing style,
 * product positioning, and CMS skills for content creation.
 */
import { serve } from "@decocms/mcps-shared/serve";
import { DefaultEnv, withRuntime } from "@decocms/runtime";
import { z } from "zod";
import { SKILL_IDS } from "./skills/data.ts";
import { tools } from "./tools/index.ts";

/**
 * State schema with skill selection
 */
export const StateSchema = z.object({
  enabledSkills: z
    .array(z.string())
    .default(SKILL_IDS)
    .describe(
      "Select which skills to enable. Each skill provides guidance for different aspects of content creation.",
    ),
});

export type StateType = z.infer<typeof StateSchema>;

export type Env = DefaultEnv & {
  STATE?: StateType;
};

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    scopes: [],
    state: StateSchema,
  },
  tools,
});

serve(runtime.fetch);
