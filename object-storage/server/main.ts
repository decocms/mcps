/**
 * This is the main entry point for your application and
 * MCP server. This is a Cloudflare workers app, and serves
 * both your MCP server at /mcp and your views as a react
 * application at /.
 */
import { DefaultEnv, withRuntime } from "@decocms/runtime";
import { z } from "zod";

import { tools } from "./tools/index.ts";

/**
 * Extended StateSchema with S3 configuration for object storage.
 * This allows the MCP to connect to any S3-compatible storage provider.
 */
export const StateSchema = z.object({
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
export type Env = DefaultEnv<typeof StateSchema>;

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    state: StateSchema,
  },
  tools,
});

export default runtime;
