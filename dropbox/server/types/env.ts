import type { Registry } from "@decocms/mcps-shared/registry";
import { type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

/**
 * No user-configurable options. All auth flows through OAuth and the bearer
 * token rides in via MESH_REQUEST_CONTEXT.authorization on every call.
 */
export const StateSchema = z.object({});

/**
 * Dropbox secrets arrive via `wrangler secret put` and are exposed through
 * `process.env` under `nodejs_compat`.
 */
export type Env = DefaultEnv<typeof StateSchema, Registry> & {
  DROPBOX_CLIENT_ID?: string;
  DROPBOX_CLIENT_SECRET?: string;
};

export type { Registry };
