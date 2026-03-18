import { BindingOf, type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  DATABASE: BindingOf("@deco/postgres"),
  EVENT_BUS: BindingOf("@deco/event-bus"),
  CONNECTION: BindingOf("@deco/connection"),
  MODEL_PROVIDER: BindingOf("@deco/llm").optional(),
  LANGUAGE_MODEL: z
    .object({
      __type: z.literal("@deco/language-model"),
      value: z.object({
        connectionId: z.string(),
        id: z.string(),
      }),
    })
    .optional(),
  GMAIL_POLL_INTERVAL_MINUTES: z
    .number()
    .optional()
    .describe("Gmail poll interval in minutes (default: 3)"),
});

export type Env = DefaultEnv<typeof StateSchema>;
