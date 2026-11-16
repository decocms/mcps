import { createPublicResource } from "@decocms/runtime/tools";
import type { Env } from "../types/env.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

/**
 * The built single-file HTML is inlined at build time (via a `?raw` import in
 * resources/index.ts) and passed in as `html`. On Cloudflare Workers there is
 * no filesystem to read it from at runtime.
 */
export function createMcpAppResource(options: {
  uri: string;
  name: string;
  description: string;
  html: string;
}) {
  return (_env: Env) =>
    createPublicResource({
      uri: options.uri,
      name: options.name,
      description: options.description,
      mimeType: RESOURCE_MIME_TYPE,
      read: async () => ({
        uri: options.uri,
        mimeType: RESOURCE_MIME_TYPE,
        text: options.html,
      }),
    });
}
