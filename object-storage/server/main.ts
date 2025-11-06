/**
 * This is the main entry point for your application and
 * MCP server. This is a Cloudflare workers app, and serves
 * both your MCP server at /mcp and your views as a react
 * application at /.
 */
import { DefaultEnv, withRuntime } from "@deco/workers-runtime";
import {
  type Env as DecoEnv,
  StateSchema as BaseStateSchema,
} from "../shared/deco.gen.ts";
import { z } from "zod";

import { tools } from "./tools/index.ts";
import { views } from "./views.ts";

/**
 * Extended StateSchema with S3 configuration for object storage.
 * This allows the MCP to connect to any S3-compatible storage provider.
 */
export const StateSchema = BaseStateSchema.extend({
  endpoint: z
    .string()
    .optional()
    .describe(
      "S3 endpoint URL (optional, defaults to AWS). For R2: https://<account-id>.r2.cloudflarestorage.com",
    ),
  region: z
    .string()
    .describe(
      'AWS region (e.g., "us-east-1"). For R2 use "auto", for GCS use "auto" or specific region',
    ),
  accessKeyId: z
    .string()
    .describe(
      "AWS access key ID or equivalent for S3-compatible storage. For GCS, generate HMAC keys.",
    ),
  secretAccessKey: z
    .string()
    .describe("AWS secret access key or equivalent for S3-compatible storage"),
  bucketName: z.string().describe("Default bucket name for operations"),
  defaultPresignedUrlExpiration: z
    .number()
    .optional()
    .describe(
      "Default expiration time for presigned URLs in seconds (default: 3600)",
    ),
});

/**
 * This Env type is the main context object that is passed to
 * all of your Application.
 *
 * It includes all of the generated types from your
 * Deco bindings, along with the default ones.
 */
export type Env = DefaultEnv &
  DecoEnv & {
    ASSETS: {
      fetch: (request: Request, init?: RequestInit) => Promise<Response>;
    };
  };

const runtime = withRuntime<Env, typeof StateSchema>({
  oauth: {
    /**
     * These scopes define the asking permissions of your
     * app when a user is installing it. When a user
     * authorizes your app for using AI_GENERATE, you will
     * now be able to use `env.AI_GATEWAY.AI_GENERATE`
     * and utilize the user's own AI Gateway, without having to
     * deploy your own, setup any API keys, etc.
     */
    scopes: [],
    /**
     * The state schema of your Application defines what
     * your installed App state will look like. When a user
     * is installing your App, they will have to fill in
     * a form with the fields defined in the state schema.
     *
     * This is powerful for building multi-tenant apps,
     * where you can have multiple users and projects
     * sharing different configurations on the same app.
     *
     * When you define a binding dependency on another app,
     * it will automatically be linked to your StateSchema on
     * type generation. You can also `.extend` it to add more
     * fields to the state schema, like asking for an API Key
     * for connecting to a third-party service.
     */
    state: StateSchema,
  },
  views,
  tools,
  /**
   * Fallback directly to assets for all requests that do not match a tool or auth.
   * If you wanted to add custom api routes that dont make sense to be a tool,
   * you can add them on this handler.
   */
  fetch: (req, env) => env.ASSETS.fetch(req),
});

export default runtime;
