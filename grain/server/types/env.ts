import { type DefaultEnv } from "@decocms/runtime";
import z from "zod";

export const StateSchema = z.object({
  WEBHOOK_URL: z
    .string()
    .default("https://sites-grain.decocache.com/webhooks/grain/{connectionId}")
    .readonly()
    .describe(
      "Webhook URL template used by Grain. Replace {connectionId} with your connection ID from the Mesh URL.",
    ),
});

export type Env = DefaultEnv<typeof StateSchema>;
