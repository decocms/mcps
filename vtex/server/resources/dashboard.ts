import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicResource } from "@decocms/runtime/tools";
import { VTEX_RESOURCE_URI } from "../constants.ts";
import type { Env } from "../types/env.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

function getDistPath(): string {
  const projectRoot = join(import.meta.dir, "../..");
  return join(projectRoot, "dist", "client", "index.html");
}

export const dashboardResource = (_env: Env) =>
  createPublicResource({
    uri: VTEX_RESOURCE_URI,
    name: "VTEX Dashboard",
    description:
      "Bundled React UI for visualizing VTEX commerce data — orders timeline and analytics.",
    mimeType: RESOURCE_MIME_TYPE,
    read: async () => {
      const html = await readFile(getDistPath(), "utf-8");
      return {
        uri: VTEX_RESOURCE_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: html,
      };
    },
  });
