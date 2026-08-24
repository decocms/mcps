import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import { GaClient } from "google-analytics/client";
import { AccountSummariesResponseSchema } from "google-analytics/schemas";
import { getServiceAccountAccessToken } from "@decocms/mcps-shared/google-service-account";
import type { Env } from "../../shared/deco.gen.ts";
import { resolveServiceAccount, SCOPES } from "../lib/sa-auth.ts";

const grantInstructions = (email: string) =>
  `No GA4 property is readable by ${email} yet. In Google Analytics, open Admin > ` +
  `Property access management (pick the property first), click "+", add ${email}, ` +
  `choose the Viewer role, and click Add. Then run this tool again to confirm.`;

const AccessibleProperty = z.object({
  property: z.string().describe("Resource name, e.g. 'properties/1234567'."),
  displayName: z.string(),
  account: z.string().nullish(),
  accountName: z.string().nullish(),
});

export const checkServiceAccountAccessTool = (env: Env) =>
  createPrivateTool({
    id: "check-service-account-access",
    description:
      "Diagnoses this integration's service account: which credential is in use, which email to grant access to, and which GA4 properties it can currently read. Run this first when setting up, or whenever a report fails with a permission error.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      ok: z
        .boolean()
        .describe(
          "True when the service account can read at least one GA4 property.",
        ),
      mode: z
        .enum(["deco-managed", "connection"])
        .nullish()
        .describe(
          "'deco-managed' uses the shared service account; 'connection' uses the JSON key pasted in this install's settings.",
        ),
      serviceAccountEmail: z
        .string()
        .nullish()
        .describe("The email to grant Viewer access to on the GA4 property."),
      accessibleProperties: z.array(AccessibleProperty),
      nextStep: z
        .string()
        .nullish()
        .describe(
          "What to do next, in plain words. Null when nothing is needed.",
        ),
      error: z.string().nullish(),
    }),
    execute: async () => {
      // Diagnostics must always answer, so failures come back as data rather
      // than as a thrown error the caller has to interpret.
      let account: ReturnType<typeof resolveServiceAccount>;
      try {
        account = resolveServiceAccount(env);
      } catch (error) {
        return {
          ok: false,
          mode: null,
          serviceAccountEmail: null,
          accessibleProperties: [],
          nextStep: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      try {
        const token = await getServiceAccountAccessToken(account.json, SCOPES);
        const raw = await new GaClient(token).listAccountSummaries();
        const { response } = AccountSummariesResponseSchema.parse({
          response: raw,
        });

        const properties = (response.accountSummaries ?? []).flatMap(
          (summary) =>
            (summary.propertySummaries ?? []).map((prop) => ({
              property: prop.property,
              displayName: prop.displayName,
              account: summary.account ?? null,
              accountName: summary.displayName ?? null,
            })),
        );

        return {
          ok: properties.length > 0,
          mode: account.source,
          serviceAccountEmail: account.clientEmail,
          accessibleProperties: properties,
          nextStep:
            properties.length > 0
              ? null
              : grantInstructions(account.clientEmail),
          error: null,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          mode: account.source,
          serviceAccountEmail: account.clientEmail,
          accessibleProperties: [],
          nextStep:
            "The check could not complete — read `error` for what Google said. A disabled API means enabling " +
            "the Google Analytics Data API and Google Analytics Admin API in that service account's Google Cloud " +
            "project. 'invalid_grant' means the key was deleted or belongs to a service account that no longer " +
            `exists. A permission error means granting ${account.clientEmail} the Viewer role on the GA4 property.`,
          error: message,
        };
      }
    },
  });
