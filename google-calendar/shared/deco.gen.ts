import { BindingOf, type DefaultEnv } from "@decocms/runtime";
import type { Registry } from "@decocms/mcps-shared/registry";
import { z } from "zod";

export const StateSchema = z.object({
  EVENT_BUS: BindingOf("@deco/event-bus"),

  // Read-only template shown in the connection UI. Replace {connectionId} with
  // your connection ID (visible in the browser URL), or call
  // get_apps_script_config to get the full URL + token for the Apps Script.
  WEBHOOK_URL: z
    .string()
    .default(
      "https://sites-google-calendar.deco.site/calendar/events/{connectionId}",
    )
    .readonly()
    .describe(
      "Webhook URL the Google Apps Script posts events to. Use get_apps_script_config to get the URL + token for this connection.",
    ),
});

export type Env = DefaultEnv<typeof StateSchema, Registry>;
