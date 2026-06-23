import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicResource } from "@decocms/runtime/tools";
import type { Env } from "../types/env.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

function getHtmlPath(filename: string): string {
  const projectRoot = join(import.meta.dir, "../..");
  return join(projectRoot, "dist", "client", filename);
}

export function createMcpAppResource(options: {
  uri: string;
  name: string;
  description: string;
  htmlFile: string;
}) {
  return (_env: Env) =>
    createPublicResource({
      uri: options.uri,
      name: options.name,
      description: options.description,
      mimeType: RESOURCE_MIME_TYPE,
      read: async () => {
        const html = await readFile(getHtmlPath(options.htmlFile), "utf-8");
        return {
          uri: options.uri,
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
        };
      },
    });
}
