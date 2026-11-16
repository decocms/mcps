import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicResource } from "@decocms/runtime/tools";
import { IMPORT_RESOURCE_URI } from "../tools/import.ts";
import type { Env } from "../types/env.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";
const distPath = join(import.meta.dir, "../..", "dist", "client", "index.html");

export const importAppResource = (_env: Env) =>
  createPublicResource({
    uri: IMPORT_RESOURCE_URI,
    name: "Figma import UI",
    description: "Guides the user through exporting a .fig file and uploads it",
    mimeType: RESOURCE_MIME_TYPE,
    read: async () => ({
      uri: IMPORT_RESOURCE_URI,
      mimeType: RESOURCE_MIME_TYPE,
      text: await readFile(distPath, "utf-8"),
    }),
  });
