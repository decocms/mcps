import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { dataApi } from "../lib/yt-client.ts";
import { getMyChannel } from "../lib/yt-data.ts";
import type { Env } from "../types/env.ts";
import { CommentSchema, CommentThreadSchema } from "./views.ts";

interface RawComment {
  id: string;
  snippet?: {
    authorDisplayName?: string;
    authorChannelId?: { value?: string };
    textDisplay?: string;
    textOriginal?: string;
    likeCount?: number;
    publishedAt?: string;
    updatedAt?: string;
    moderationStatus?: string;
  };
}

interface CommentThreadsResponse {
  items?: Array<{
    id: string;
    snippet?: {
      videoId?: string;
      totalReplyCount?: number;
      topLevelComment?: RawComment;
    };
    replies?: { comments?: RawComment[] };
  }>;
  nextPageToken?: string;
}

function mapComment(raw: RawComment | undefined) {
  return {
    commentId: raw?.id ?? "",
    author: raw?.snippet?.authorDisplayName ?? "",
    authorChannelId: raw?.snippet?.authorChannelId?.value,
    text: raw?.snippet?.textOriginal ?? raw?.snippet?.textDisplay ?? "",
    likeCount: Number(raw?.snippet?.likeCount ?? 0),
    publishedAt: raw?.snippet?.publishedAt,
    updatedAt: raw?.snippet?.updatedAt,
    moderationStatus: raw?.snippet?.moderationStatus,
  };
}

export const createListCommentsTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_LIST_COMMENTS",
    description:
      "List comment threads on a specific video, or the channel-wide moderation queue (pass moderationStatus=heldForReview or likelySpam without videoId).",
    inputSchema: z.object({
      videoId: z
        .string()
        .optional()
        .describe("Video to list comments for. Omit for channel-wide listing."),
      moderationStatus: z
        .enum(["published", "heldForReview", "likelySpam"])
        .optional()
        .describe("Filter by moderation status (moderation queue)"),
      order: z.enum(["time", "relevance"]).default("time"),
      searchTerms: z
        .string()
        .optional()
        .describe("Only threads containing this text"),
      maxResults: z.coerce.number().int().min(1).max(100).default(20),
      pageToken: z.string().optional(),
    }),
    outputSchema: z.object({
      threads: z.array(CommentThreadSchema),
      nextPageToken: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const params: Record<string, string | number | boolean | undefined> = {
        part: "snippet,replies",
        order: context.order,
        maxResults: context.maxResults,
        pageToken: context.pageToken,
        moderationStatus: context.moderationStatus,
        searchTerms: context.searchTerms,
      };
      if (context.videoId) {
        params.videoId = context.videoId;
      } else {
        const channel = await getMyChannel(env);
        params.allThreadsRelatedToChannelId = channel.channelId;
      }

      const data = await dataApi<CommentThreadsResponse>(
        env,
        "/commentThreads",
        { params },
      );

      return {
        threads: (data.items ?? []).map((thread) => ({
          threadId: thread.id,
          videoId: thread.snippet?.videoId,
          topComment: mapComment(thread.snippet?.topLevelComment),
          replyCount: Number(thread.snippet?.totalReplyCount ?? 0),
          replies: (thread.replies?.comments ?? []).map(mapComment),
        })),
        nextPageToken: data.nextPageToken,
      };
    },
  });

export const createReplyCommentTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_REPLY_COMMENT",
    description:
      "Reply to a comment as the channel. parentCommentId is the top-level comment id (thread's topComment.commentId).",
    inputSchema: z.object({
      parentCommentId: z.string(),
      text: z.string().min(1).max(10000),
    }),
    outputSchema: CommentSchema,
    execute: async ({ context }) => {
      const created = await dataApi<RawComment>(env, "/comments", {
        method: "POST",
        params: { part: "snippet" },
        body: {
          snippet: {
            parentId: context.parentCommentId,
            textOriginal: context.text,
          },
        },
      });
      return mapComment(created);
    },
  });

export const createCommentOnVideoTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_COMMENT_ON_VIDEO",
    description:
      "Post a new top-level comment on a video as the channel (starts a new thread).",
    inputSchema: z.object({
      videoId: z.string(),
      text: z.string().min(1).max(10000),
    }),
    outputSchema: z.object({
      threadId: z.string(),
      comment: CommentSchema,
    }),
    execute: async ({ context }) => {
      const created = await dataApi<{
        id: string;
        snippet?: { topLevelComment?: RawComment };
      }>(env, "/commentThreads", {
        method: "POST",
        params: { part: "snippet" },
        body: {
          snippet: {
            videoId: context.videoId,
            topLevelComment: {
              snippet: { textOriginal: context.text },
            },
          },
        },
      });
      return {
        threadId: created.id,
        comment: mapComment(created.snippet?.topLevelComment),
      };
    },
  });

export const createModerateCommentTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_MODERATE_COMMENT",
    description:
      "Set the moderation status of comments on the channel's videos: publish held comments, hold for review, or reject. Optionally ban the author. Note: pinning/hearting comments has NO public API — reply or publish are the available actions.",
    inputSchema: z.object({
      commentIds: z.array(z.string()).min(1).max(50),
      moderationStatus: z.enum(["published", "heldForReview", "rejected"]),
      banAuthor: z
        .boolean()
        .default(false)
        .describe(
          "Also ban the author from commenting (only valid with moderationStatus=rejected)",
        ),
    }),
    outputSchema: z.object({
      moderated: z.array(z.string()),
      moderationStatus: z.string(),
    }),
    execute: async ({ context }) => {
      await dataApi<undefined>(env, "/comments/setModerationStatus", {
        method: "POST",
        params: {
          id: context.commentIds.join(","),
          moderationStatus: context.moderationStatus,
          banAuthor: context.banAuthor || undefined,
        },
      });
      return {
        moderated: context.commentIds,
        moderationStatus: context.moderationStatus,
      };
    },
  });
