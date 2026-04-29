/**
 * Account tools — current user info and storage usage.
 */

import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { dropboxFetch, envFromCtx } from "../lib/dropbox-client.ts";

export const getCurrentAccountTool = createTool({
  id: "dropbox_get_current_account",
  description:
    "Get information about the currently authenticated Dropbox account.",
  inputSchema: z.object({}),
  execute: async (_input, ctx) =>
    dropboxFetch(envFromCtx(ctx), "users/get_current_account", {
      body: null,
    }),
});

export const getSpaceUsageTool = createTool({
  id: "dropbox_get_space_usage",
  description:
    "Get the storage quota and current usage for the authenticated account.",
  inputSchema: z.object({}),
  execute: async (_input, ctx) =>
    dropboxFetch(envFromCtx(ctx), "users/get_space_usage", {
      body: null,
    }),
});
