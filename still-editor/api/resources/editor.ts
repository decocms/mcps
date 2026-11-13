import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicResource } from "@decocms/runtime/tools";
import { STILL_EDITOR_RESOURCE_URI } from "../tools/still.ts";
import type { Env } from "../types/env.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

// api/resources in development, dist/server once bundled: both two levels
// below the app root.
const htmlPath = join(
  import.meta.dir,
  "..",
  "..",
  "dist",
  "client",
  "index.html",
);

export const editorResource = (_env: Env) =>
  createPublicResource({
    uri: STILL_EDITOR_RESOURCE_URI,
    name: "Still editor",
    description: "Edit and publish a product's Still",
    mimeType: RESOURCE_MIME_TYPE,
    read: async () => ({
      uri: STILL_EDITOR_RESOURCE_URI,
      mimeType: RESOURCE_MIME_TYPE,
      text: await readFile(htmlPath, "utf-8"),
    }),
  });
