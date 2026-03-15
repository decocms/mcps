import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicResource } from "@decocms/runtime/tools";
import { INBOX_RESOURCE_URI } from "../tools/conversations.ts";
import type { Env } from "../types/env.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

function getDistPath(): string {
  const projectRoot = join(import.meta.dir, "../..");
  return join(projectRoot, "dist", "client", "index.html");
}

export const inboxAppResource = (_env: Env) =>
  createPublicResource({
    uri: INBOX_RESOURCE_URI,
    name: "Inbox UI",
    description: "Multi-channel support inbox for Slack, Discord, and Gmail",
    mimeType: RESOURCE_MIME_TYPE,
    read: async () => {
      const html = await readFile(getDistPath(), "utf-8");
      return {
        uri: INBOX_RESOURCE_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: html,
      };
    },
  });
