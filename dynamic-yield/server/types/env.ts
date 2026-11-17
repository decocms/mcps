import type { DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  region: z
    .enum(["us", "eu"])
    .default("us")
    .describe(
      "Dynamic Yield data center of the site. US uses dy-api.com, EU uses dy-api.eu.",
    ),
  profileAnywhereKey: z
    .string()
    .optional()
    .describe(
      "Optional Profile Anywhere API key (created in the Profile Anywhere app, not in Settings › API Keys). Required only by DY_USER_PROFILE.",
    ),
  adminEmail: z
    .string()
    .optional()
    .describe(
      "DY console login email for the DY_ADMIN_* tools. Use a dedicated user with email + password login (no 2FA/SSO).",
    ),
  adminPassword: z
    .string()
    .meta({ format: "password" }) // masked input in Studio
    .optional()
    .describe("DY console password for adminEmail."),
  adminSession: z
    .string()
    .meta({ format: "password" })
    .optional()
    .describe(
      "Alternative to email/password for 2FA or SSO accounts: the RefreshToken cookie of adm.dynamicyield.com after you log in. Expires 7 days after login.",
    ),
  sectionId: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .describe(
      "Default DY section (site) id for the DY_ADMIN_* tools. List them with DY_ADMIN_SECTIONS_LIST.",
    ),
});

export type Env = DefaultEnv<typeof StateSchema>;
