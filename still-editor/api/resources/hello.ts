import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicResource } from "@decocms/runtime/tools";
import { HELLO_RESOURCE_URI } from "../tools/hello.ts";
import type { Env } from "../types/env.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

function getDistPath(): string {
  const IS_PRODUCTION = process.env.NODE_ENV === "production";
  const projectRoot = join(import.meta.dir, IS_PRODUCTION ? "../.." : "../..");
  return join(projectRoot, "dist", "client", "index.html");
}

export const helloAppResource = (_env: Env) =>
  createPublicResource({
    uri: HELLO_RESOURCE_URI,
    name: "Hello UI",
    description: "Interactive greeting display powered by MCP Apps",
    mimeType: RESOURCE_MIME_TYPE,
    read: async () => {
      const html = await readFile(getDistPath(), "utf-8");
      return {
        uri: HELLO_RESOURCE_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: html,
      };
    },
  });
