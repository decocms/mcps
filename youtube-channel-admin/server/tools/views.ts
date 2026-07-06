/** Zod schemas mirroring the views in lib/yt-data.ts (tool output schemas). */
import { z } from "zod";

export const MyChannelSchema = z.object({
  channelId: z.string(),
  title: z.string(),
  customUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  subscriberCount: z.number(),
  videoCount: z.number(),
  viewCount: z.number(),
  uploadsPlaylistId: z.string().optional(),
});

export const MyVideoSchema = z.object({
  videoId: z.string(),
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  categoryId: z.string().optional(),
  privacyStatus: z.string().optional(),
  publishedAt: z.string().optional(),
  durationSeconds: z.number().optional(),
  viewCount: z.number(),
  likeCount: z.number(),
  commentCount: z.number(),
  thumbnailUrl: z.string().optional(),
  watchUrl: z.string(),
  uploadStatus: z.string().optional(),
  failureReason: z.string().optional(),
  rejectionReason: z.string().optional(),
  processingStatus: z.string().optional(),
  processingErrors: z.array(z.string()),
  processingWarnings: z.array(z.string()),
});

export const TopVideoSchema = z.object({
  videoId: z.string(),
  title: z.string(),
  thumbnailUrl: z.string().optional(),
  watchUrl: z.string(),
  views: z.number(),
  watchMinutes: z.number(),
  likes: z.number(),
});

export const PerformanceSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  totals: z.object({
    views: z.number(),
    watchMinutes: z.number(),
    likes: z.number(),
    comments: z.number(),
    subscribersGained: z.number(),
    subscribersLost: z.number(),
  }),
  daily: z.array(z.object({ date: z.string(), views: z.number() })),
});

export const ChannelAlertSchema = z.object({
  severity: z.enum(["error", "warning"]),
  kind: z.enum([
    "upload_failed",
    "upload_rejected",
    "processing_failed",
    "processing_warning",
    "comments_held_for_review",
  ]),
  videoId: z.string().optional(),
  title: z.string().optional(),
  message: z.string(),
});

export const AlertCountsSchema = z.object({
  failed: z.number(),
  rejected: z.number(),
  processing: z.number(),
  heldForReview: z.number(),
});

export const CommentSchema = z.object({
  commentId: z.string(),
  author: z.string(),
  authorChannelId: z.string().optional(),
  text: z.string(),
  likeCount: z.number(),
  publishedAt: z.string().optional(),
  updatedAt: z.string().optional(),
  moderationStatus: z.string().optional(),
});

export const CommentThreadSchema = z.object({
  threadId: z.string(),
  videoId: z.string().optional(),
  topComment: CommentSchema,
  replyCount: z.number(),
  replies: z.array(CommentSchema),
});
