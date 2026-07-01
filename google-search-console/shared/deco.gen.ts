import { z } from "zod";

export const StateSchema = z.object({
  siteUrl: z
    .string()
    .nullish()
    .describe(
      "Default site URL (e.g., 'sc-domain:example.com' or 'https://example.com/'). Used as a fallback for tools when their `siteUrl` argument is omitted.",
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
