import { BindingOf, type DefaultEnv } from "@decocms/runtime";
import type { Registry } from "@decocms/mcps-shared/registry";
import { z } from "zod";

export const StateSchema = z.object({
  SERVICE_ACCOUNT_JSON: z
    .string()
    .describe(
      "Google service account JSON key (paste the full JSON content). The service account must have domain-wide delegation enabled.",
    ),
  IMPERSONATE_EMAILS: z
    .array(z.string())
    .describe(
      "Emails of Google Workspace users to impersonate. Events from all users are merged and deduplicated.",
    ),
  EVENT_BUS: BindingOf("@deco/event-bus").optional(),

  LEAD_MINUTES: z
    .number()
    .default(10)
    .describe(
      "Minutes before an event to notify via trigger (default: 10). The scheduler polls every 5 minutes.",
    ),
});

export type Env = DefaultEnv<typeof StateSchema, Registry>;
