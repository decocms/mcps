import { z } from "zod";

export const StateSchema = z.object({
  propertyId: z
    .string()
    .nullish()
    .describe(
      "Default GA4 Property identifier — 'properties/1234567' or just '1234567'. Used as a fallback for tools when their `property` argument is omitted.",
    ),
  SERVICE_ACCOUNT_JSON: z
    .string()
    .nullish()
    .describe(
      "Optional. Paste the JSON key of your own Google Cloud service account. Leave empty to use the managed service account — run the `check-service-account-access` tool to find out which email to grant Viewer access to on your GA4 property.",
    ),
});

export interface MeshRequestContext {
  authorization?: string;
  state?: z.infer<typeof StateSchema>;
  token?: string;
  meshUrl?: string;
  connectionId?: string;
  ensureAuthenticated?: () => Promise<void>;
}

export interface Env {
  /** Managed service account key, set as a site secret. Fallback for connections that bring no key of their own. */
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  MESH_REQUEST_CONTEXT: MeshRequestContext;
  SELF?: unknown;
  IS_LOCAL?: boolean;
}
