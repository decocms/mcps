import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { getAccessToken } from "../lib/env.ts";
import { FigmaClient } from "../lib/figma-client.ts";

export const createGetCommentsTool = (env: Env) =>
  createPrivateTool({
    id: "figma_get_comments",
    description:
      "Get all comments on a Figma file. Returns comment threads with user info, timestamps, and positions.",
    inputSchema: z.object({
      file_key: z.string().describe("The key of the Figma file."),
      as_md: z
        .boolean()
        .optional()
        .describe("If true, returns comment messages in Markdown format."),
    }),
    execute: async ({ context }) => {
      const { file_key, ...params } = context;
      const client = new FigmaClient(getAccessToken(env));
      return await client.getComments(file_key, params);
    },
  });

export const createPostCommentTool = (env: Env) =>
  createPrivateTool({
    id: "figma_post_comment",
    description:
      "Post a comment on a Figma file. Can be a top-level comment or a reply to an existing comment.",
    inputSchema: z.object({
      file_key: z.string().describe("The key of the Figma file."),
      message: z.string().describe("The comment message text."),
      comment_id: z
        .string()
        .optional()
        .describe(
          "The ID of the comment to reply to. If omitted, creates a top-level comment.",
        ),
      client_meta: z
        .object({
          x: z.number().describe("X coordinate of the comment pin."),
          y: z.number().describe("Y coordinate of the comment pin."),
          node_id: z
            .string()
            .optional()
            .describe("The node ID to attach the comment to."),
          node_offset: z
            .object({
              x: z.number(),
              y: z.number(),
            })
            .optional()
            .describe("Offset from the node origin."),
        })
        .optional()
        .describe("Position metadata for the comment pin on the canvas."),
    }),
    execute: async ({ context }) => {
      const { file_key, message, ...options } = context;
      const client = new FigmaClient(getAccessToken(env));
      return await client.postComment(file_key, message, options);
    },
  });

export const createDeleteCommentTool = (env: Env) =>
  createPrivateTool({
    id: "figma_delete_comment",
    description: "Delete a comment from a Figma file.",
    inputSchema: z.object({
      file_key: z.string().describe("The key of the Figma file."),
      comment_id: z.string().describe("The ID of the comment to delete."),
    }),
    execute: async ({ context }) => {
      const client = new FigmaClient(getAccessToken(env));
      await client.deleteComment(context.file_key, context.comment_id);
      return { success: true };
    },
  });

export const createGetCommentReactionsTool = (env: Env) =>
  createPrivateTool({
    id: "figma_get_comment_reactions",
    description: "Get all emoji reactions on a specific comment.",
    inputSchema: z.object({
      file_key: z.string().describe("The key of the Figma file."),
      comment_id: z.string().describe("The ID of the comment."),
    }),
    execute: async ({ context }) => {
      const client = new FigmaClient(getAccessToken(env));
      return await client.getCommentReactions(
        context.file_key,
        context.comment_id,
      );
    },
  });

export const createPostCommentReactionTool = (env: Env) =>
  createPrivateTool({
    id: "figma_post_comment_reaction",
    description: "Add an emoji reaction to a comment.",
    inputSchema: z.object({
      file_key: z.string().describe("The key of the Figma file."),
      comment_id: z.string().describe("The ID of the comment to react to."),
      emoji: z
        .string()
        .describe(
          "The emoji shortcode to react with (e.g., ':heart:', ':+1:').",
        ),
    }),
    execute: async ({ context }) => {
      const client = new FigmaClient(getAccessToken(env));
      return await client.postCommentReaction(
        context.file_key,
        context.comment_id,
        context.emoji,
      );
    },
  });

export const createDeleteCommentReactionTool = (env: Env) =>
  createPrivateTool({
    id: "figma_delete_comment_reaction",
    description: "Remove an emoji reaction from a comment.",
    inputSchema: z.object({
      file_key: z.string().describe("The key of the Figma file."),
      comment_id: z.string().describe("The ID of the comment."),
      emoji: z
        .string()
        .describe("The emoji shortcode to remove (e.g., ':heart:', ':+1:')."),
    }),
    execute: async ({ context }) => {
      const client = new FigmaClient(getAccessToken(env));
      await client.deleteCommentReaction(
        context.file_key,
        context.comment_id,
        context.emoji,
      );
      return { success: true };
    },
  });

export const commentTools = [
  createGetCommentsTool,
  createPostCommentTool,
  createDeleteCommentTool,
  createGetCommentReactionsTool,
  createPostCommentReactionTool,
  createDeleteCommentReactionTool,
];
