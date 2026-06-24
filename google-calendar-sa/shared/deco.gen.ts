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

  WEBHOOK_URL: z
    .string()
    .default(
      "https://sites-google-calendar-sa.deco.site/calendar/events/{connectionId}",
    )
    .readonly()
    .describe(
      "Webhook URL the Google Apps Script posts events to. Use get_apps_script_config to get the URL + token for this connection.",
    ),
});

export type Env = DefaultEnv<typeof StateSchema, Registry>;
