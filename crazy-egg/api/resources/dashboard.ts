import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicResource } from "@decocms/runtime/tools";
import { CRAZY_EGG_RESOURCE_URI } from "../constants.ts";
import type { Env } from "../types/env.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

function getDistPath(): string {
  const IS_PRODUCTION = process.env.NODE_ENV === "production";
  // In development, api/resources/ is two levels deep from the project root.
  // In production builds (dist/server/main.js), the file is also two levels up.
  const projectRoot = join(import.meta.dir, IS_PRODUCTION ? "../.." : "../..");
  return join(projectRoot, "dist", "client", "index.html");
}

export const dashboardResource = (_env: Env) =>
  createPublicResource({
    uri: CRAZY_EGG_RESOURCE_URI,
    name: "Crazy Egg Dashboard",
    description:
      "Bundled React UI for visualizing Crazy Egg analytics — heatmap snapshots, A/B tests, funnels, recordings, surveys, and traffic.",
    mimeType: RESOURCE_MIME_TYPE,
    read: async () => {
      const html = await readFile(getDistPath(), "utf-8");
      return {
        uri: CRAZY_EGG_RESOURCE_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: html,
      };
    },
  });
