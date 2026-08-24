import {
  getServiceAccountAccessToken,
  parseServiceAccountKey,
} from "@decocms/mcps-shared/google-service-account";
import { GOOGLE_SCOPES } from "google-analytics/constants";
import type { Env } from "../../shared/deco.gen.ts";

export const SCOPES = [GOOGLE_SCOPES.ANALYTICS_READONLY];

/** Where the key came from — surfaced by `check-service-account-access`. */
export type CredentialSource = "connection" | "deco-managed";

export interface ResolvedServiceAccount {
  json: string;
  source: CredentialSource;
  /** Public identifier of the service account; the email to grant on the GA4 property. */
  clientEmail: string;
}

/**
 * A key pasted on the connection wins over the managed one, so a customer can
 * keep quota and audit trail in their own Google Cloud project.
 *
 * GA4 grants access to the service account identity directly (add the email as
 * a property user), so no impersonation subject is involved anywhere.
 */
export const resolveServiceAccount = (env: Env): ResolvedServiceAccount => {
  const fromState =
    env.MESH_REQUEST_CONTEXT?.state?.SERVICE_ACCOUNT_JSON?.trim();
  const fromEnv = env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const json = fromState || fromEnv;

  if (!json) {
    throw new Error(
      "No service account configured. Either paste a service account JSON key into SERVICE_ACCOUNT_JSON, " +
        "or ask deco support to enable the managed service account for this install.",
    );
  }

  return {
    json,
    source: fromState ? "connection" : "deco-managed",
    clientEmail: parseServiceAccountKey(json).client_email,
  };
};

export const getAccessToken = (env: Env): Promise<string> =>
  getServiceAccountAccessToken(resolveServiceAccount(env).json, SCOPES);

/** Clones env with a bearer token, so tools never share a mutable auth slot. */
export const withToken = (env: Env, token: string): Env => ({
  ...env,
  MESH_REQUEST_CONTEXT: { ...env.MESH_REQUEST_CONTEXT, authorization: token },
});
