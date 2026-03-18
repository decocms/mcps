import { BindingOf, type DefaultEnv } from "@decocms/runtime";
import type { Registry } from "@decocms/mcps-shared/registry";
import { z } from "zod";

export const StateSchema = z.object({
  SERVICE_ACCOUNT_JSON: z
    .string()
    .describe(
      "Google service account JSON key (paste the full JSON content). The service account must have domain-wide delegation enabled.",
    ),
  IMPERSONATE_EMAIL: z
    .string()
    .describe(
      "Email of the Google Workspace user to impersonate (e.g. deco@deco.cx). The service account will access this user's calendar.",
    ),
  EVENT_BUS: BindingOf("@deco/event-bus").optional(),
});

export type Env = DefaultEnv<typeof StateSchema, Registry>;
