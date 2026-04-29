/**
 * Sharing tools — shared links and shared folders.
 */

import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { dropboxFetch, envFromCtx } from "../lib/dropbox-client.ts";

export const createSharedLinkTool = createTool({
  id: "dropbox_create_shared_link",
  description:
    "Create a shared link for a file or folder. Returns an existing link if one already exists with the same settings.",
  inputSchema: z.object({
    path: z.string().describe("Dropbox path of the item to share."),
    settings: z
      .object({
        requested_visibility: z
          .enum(["public", "team_only", "password"])
          .optional(),
        link_password: z
          .string()
          .optional()
          .describe("Required if requested_visibility=password."),
        expires: z
          .string()
          .optional()
          .describe("ISO 8601 timestamp when the link should expire."),
        audience: z
          .enum(["public", "team", "no_one", "password", "members"])
          .optional(),
        access: z.enum(["viewer", "editor", "max"]).optional(),
        allow_download: z.boolean().optional(),
      })
      .optional(),
  }),
  execute: async ({ context }, ctx) =>
    dropboxFetch(
      envFromCtx(ctx),
      "sharing/create_shared_link_with_settings",
      {
        body: {
          path: context.path,
          settings: context.settings,
        },
      },
    ),
});

export const listSharedLinksTool = createTool({
  id: "dropbox_list_shared_links",
  description:
    "List shared links owned by the current user. Pass `path` to filter to a single item, or `cursor` to continue pagination.",
  inputSchema: z.object({
    path: z.string().optional(),
    cursor: z.string().optional(),
    direct_only: z
      .boolean()
      .optional()
      .describe(
        "Only return links explicitly created on the requested path (vs inherited).",
      ),
  }),
  execute: async ({ context }, ctx) =>
    dropboxFetch(envFromCtx(ctx), "sharing/list_shared_links", {
      body: {
        path: context.path,
        cursor: context.cursor,
        direct_only: context.direct_only,
      },
    }),
});

export const shareFolderTool = createTool({
  id: "dropbox_share_folder",
  description:
    "Convert a folder into a shared folder. Returns either the shared folder metadata (sync) or a job id (async — poll /sharing/check_share_job_status if needed).",
  inputSchema: z.object({
    path: z.string().describe("Dropbox path of the folder to share."),
    acl_update_policy: z.enum(["owner", "editors"]).optional(),
    force_async: z.boolean().optional(),
    member_policy: z.enum(["team", "anyone"]).optional(),
    shared_link_policy: z.enum(["anyone", "members"]).optional(),
    viewer_info_policy: z.enum(["enabled", "disabled"]).optional(),
    access_inheritance: z.enum(["inherit", "no_inherit"]).optional(),
  }),
  execute: async ({ context }, ctx) =>
    dropboxFetch(envFromCtx(ctx), "sharing/share_folder", {
      body: {
        path: context.path,
        acl_update_policy: context.acl_update_policy,
        force_async: context.force_async,
        member_policy: context.member_policy,
        shared_link_policy: context.shared_link_policy,
        viewer_info_policy: context.viewer_info_policy,
        access_inheritance: context.access_inheritance,
      },
    }),
});

const MemberSelectorSchema = z
  .object({
    email: z.string().optional().describe("Dropbox account email."),
    dropbox_id: z.string().optional().describe("Dropbox account id."),
  })
  .refine((v) => !!(v.email || v.dropbox_id), {
    message: "Provide either email or dropbox_id.",
  });

export const addFolderMemberTool = createTool({
  id: "dropbox_add_folder_member",
  description:
    "Add one or more members to a shared folder. Each member is identified by email or dropbox_id.",
  inputSchema: z.object({
    shared_folder_id: z
      .string()
      .describe(
        "ID of the shared folder (returned by /sharing/share_folder or list_folder).",
      ),
    members: z
      .array(
        z.object({
          member: MemberSelectorSchema,
          access_level: z
            .enum(["viewer", "editor", "owner", "viewer_no_comment"])
            .optional()
            .describe("Default: viewer."),
        }),
      )
      .min(1),
    quiet: z
      .boolean()
      .optional()
      .describe("Don't send invitation emails to new members."),
    custom_message: z
      .string()
      .optional()
      .describe("Optional message included in the invitation email."),
  }),
  execute: async ({ context }, ctx) => {
    const members = context.members.map((m) => ({
      member: m.member.email
        ? { ".tag": "email", email: m.member.email }
        : { ".tag": "dropbox_id", dropbox_id: m.member.dropbox_id },
      access_level: m.access_level
        ? { ".tag": m.access_level }
        : { ".tag": "viewer" },
    }));

    return dropboxFetch(envFromCtx(ctx), "sharing/add_folder_member", {
      body: {
        shared_folder_id: context.shared_folder_id,
        members,
        quiet: context.quiet,
        custom_message: context.custom_message,
      },
    });
  },
});
