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
        const htmlPath = getHtmlPath(options.htmlFile);
        try {
          const html = await readFile(htmlPath, "utf-8");
          return {
            uri: options.uri,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
          };
        } catch (err) {
          const message =
            err instanceof Error && "code" in err && err.code === "ENOENT"
              ? `MCP App bundle not found at ${htmlPath}. Run "bun run build:web" in the magento folder (or "bun run dev" to build and watch).`
              : err instanceof Error
                ? err.message
                : "Failed to read MCP App bundle";
          throw new Error(message);
        }
      },
    });
}
