import { z } from "zod";

export const StateSchema = z.object({
  propertyId: z
    .string()
    .nullish()
    .describe(
      "Default GA4 Property identifier — 'properties/1234567' or just '1234567'. Used as a fallback for tools when their `property` argument is omitted.",
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
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  MESH_REQUEST_CONTEXT: MeshRequestContext;
  SELF?: unknown;
  IS_LOCAL?: boolean;
}
