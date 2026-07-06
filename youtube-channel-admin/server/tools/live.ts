import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { dataApi } from "../lib/yt-client.ts";
import type { Env } from "../types/env.ts";

// ---------------------------------------------------------------------------
// Shared response interfaces
// ---------------------------------------------------------------------------

interface BroadcastResponse {
  items?: BroadcastItem[];
  nextPageToken?: string;
}

interface BroadcastItem {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    scheduledStartTime?: string;
    scheduledEndTime?: string;
    actualStartTime?: string;
    actualEndTime?: string;
    liveChatId?: string;
    thumbnails?: {
      high?: { url?: string };
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
  status?: {
    lifeCycleStatus?: string;
    privacyStatus?: string;
  };
  contentDetails?: {
    boundStreamId?: string;
    enableAutoStart?: boolean;
    enableAutoStop?: boolean;
    enableDvr?: boolean;
    enableEmbed?: boolean;
    latencyPreference?: string;
    monitorStream?: { enableMonitorStream?: boolean };
    videoId?: string;
  };
}

interface LiveStreamResponse {
  items?: LiveStreamItem[];
  nextPageToken?: string;
}

interface LiveStreamItem {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
  };
  cdn?: {
    ingestionType?: string;
    resolution?: string;
    frameRate?: string;
    ingestionInfo?: {
      streamName?: string;
      ingestionAddress?: string;
      backupIngestionAddress?: string;
    };
  };
  status?: {
    streamStatus?: string;
  };
}

interface LiveChatMessagesResponse {
  items?: LiveChatMessageItem[];
  nextPageToken?: string;
  pollingIntervalMillis?: number;
}

interface LiveChatMessageItem {
  id: string;
  snippet?: {
    type?: string;
    displayMessage?: string;
    textMessageDetails?: { messageText?: string };
    publishedAt?: string;
  };
  authorDetails?: {
    channelId?: string;
    displayName?: string;
  };
}

// ---------------------------------------------------------------------------
// Helper: map a BroadcastItem to the standard output shape
// ---------------------------------------------------------------------------

function mapBroadcast(item: BroadcastItem) {
  const thumb =
    item.snippet?.thumbnails?.high?.url ??
    item.snippet?.thumbnails?.medium?.url ??
    item.snippet?.thumbnails?.default?.url;
  return {
    broadcastId: item.id,
    title: item.snippet?.title ?? "",
    scheduledStartTime: item.snippet?.scheduledStartTime,
    scheduledEndTime: item.snippet?.scheduledEndTime,
    actualStartTime: item.snippet?.actualStartTime,
    actualEndTime: item.snippet?.actualEndTime,
    lifeCycleStatus: item.status?.lifeCycleStatus ?? "",
    privacyStatus: item.status?.privacyStatus ?? "",
    liveChatId: item.snippet?.liveChatId,
    thumbnailUrl: thumb,
    watchUrl: `https://www.youtube.com/watch?v=${item.id}`,
  };
}

// ---------------------------------------------------------------------------
// 1. createListBroadcastsTool
// ---------------------------------------------------------------------------

export const createListBroadcastsTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_LIST_BROADCASTS",
    description:
      "List live broadcasts (scheduled, live, or completed). Use broadcastStatus to filter.",
    inputSchema: z.object({
      broadcastStatus: z
        .enum(["all", "active", "completed", "upcoming"])
        .default("upcoming"),
      maxResults: z.coerce.number().int().min(1).max(50).default(25),
      pageToken: z.string().optional(),
    }),
    outputSchema: z.object({
      broadcasts: z.array(
        z.object({
          broadcastId: z.string(),
          title: z.string(),
          scheduledStartTime: z.string().optional(),
          scheduledEndTime: z.string().optional(),
          actualStartTime: z.string().optional(),
          actualEndTime: z.string().optional(),
          lifeCycleStatus: z.string(),
          privacyStatus: z.string(),
          liveChatId: z.string().optional(),
          thumbnailUrl: z.string().optional(),
          watchUrl: z.string(),
        }),
      ),
      nextPageToken: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const data = await dataApi<BroadcastResponse>(env, "/liveBroadcasts", {
        params: {
          part: "snippet,status,contentDetails",
          broadcastStatus: context.broadcastStatus,
          maxResults: context.maxResults,
          pageToken: context.pageToken,
        },
      });
      return {
        broadcasts: (data.items ?? []).map(mapBroadcast),
        nextPageToken: data.nextPageToken,
      };
    },
  });

// ---------------------------------------------------------------------------
// 2. createCreateBroadcastTool
// ---------------------------------------------------------------------------

export const createCreateBroadcastTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_CREATE_BROADCAST",
    description:
      "Create a live broadcast or schedule a Premiere. For a Premiere: upload the video first, then bind with YOUTUBE_ADMIN_BIND_BROADCAST using videoId. For a live stream: create a liveStream too, then bind with streamId.",
    inputSchema: z.object({
      title: z.string().max(100),
      description: z.string().max(5000).optional(),
      scheduledStartTime: z
        .string()
        .describe("ISO 8601 datetime (UTC) for when the broadcast goes live"),
      scheduledEndTime: z.string().optional(),
      privacyStatus: z
        .enum(["public", "unlisted", "private"])
        .default("public"),
      enableAutoStart: z.boolean().default(false),
      enableAutoStop: z.boolean().default(false),
      enableDvr: z.boolean().default(true),
      enableEmbed: z.boolean().default(true),
      latencyPreference: z
        .enum(["normal", "low", "ultraLow"])
        .default("normal"),
    }),
    outputSchema: z.object({
      broadcastId: z.string(),
      title: z.string(),
      scheduledStartTime: z.string(),
      lifeCycleStatus: z.string(),
      privacyStatus: z.string(),
      liveChatId: z.string().optional(),
      watchUrl: z.string(),
    }),
    execute: async ({ context }) => {
      const item = await dataApi<BroadcastItem>(env, "/liveBroadcasts", {
        method: "POST",
        params: { part: "snippet,status,contentDetails" },
        body: {
          snippet: {
            title: context.title,
            description: context.description,
            scheduledStartTime: context.scheduledStartTime,
            scheduledEndTime: context.scheduledEndTime,
          },
          status: {
            privacyStatus: context.privacyStatus,
          },
          contentDetails: {
            enableAutoStart: context.enableAutoStart,
            enableAutoStop: context.enableAutoStop,
            enableDvr: context.enableDvr,
            enableEmbed: context.enableEmbed,
            latencyPreference: context.latencyPreference,
            monitorStream: { enableMonitorStream: false },
          },
        },
      });
      return {
        broadcastId: item.id,
        title: item.snippet?.title ?? context.title,
        scheduledStartTime:
          item.snippet?.scheduledStartTime ?? context.scheduledStartTime,
        lifeCycleStatus: item.status?.lifeCycleStatus ?? "",
        privacyStatus: item.status?.privacyStatus ?? context.privacyStatus,
        liveChatId: item.snippet?.liveChatId,
        watchUrl: `https://www.youtube.com/watch?v=${item.id}`,
      };
    },
  });

// ---------------------------------------------------------------------------
// 3. createUpdateBroadcastTool
// ---------------------------------------------------------------------------

export const createUpdateBroadcastTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_UPDATE_BROADCAST",
    description:
      "Update a broadcast's title, description, scheduled time or privacy.",
    inputSchema: z.object({
      broadcastId: z.string(),
      title: z.string().max(100).optional(),
      description: z.string().max(5000).optional(),
      scheduledStartTime: z.string().optional(),
      scheduledEndTime: z.string().optional(),
      privacyStatus: z.enum(["public", "unlisted", "private"]).optional(),
    }),
    outputSchema: z.object({
      broadcastId: z.string(),
      title: z.string(),
      scheduledStartTime: z.string(),
      lifeCycleStatus: z.string(),
      privacyStatus: z.string(),
      liveChatId: z.string().optional(),
      watchUrl: z.string(),
    }),
    execute: async ({ context }) => {
      const current = await dataApi<BroadcastResponse>(env, "/liveBroadcasts", {
        params: {
          part: "snippet,status,contentDetails",
          id: context.broadcastId,
        },
      });
      const existing = current.items?.[0];
      if (!existing) {
        throw new Error(`Broadcast ${context.broadcastId} not found.`);
      }

      const snippet = {
        ...existing.snippet,
        title: context.title ?? existing.snippet?.title,
        description: context.description ?? existing.snippet?.description,
        scheduledStartTime:
          context.scheduledStartTime ?? existing.snippet?.scheduledStartTime,
        scheduledEndTime:
          context.scheduledEndTime ?? existing.snippet?.scheduledEndTime,
      };
      const status = {
        ...existing.status,
        privacyStatus: context.privacyStatus ?? existing.status?.privacyStatus,
      };

      const updated = await dataApi<BroadcastItem>(env, "/liveBroadcasts", {
        method: "PUT",
        params: { part: "snippet,status,contentDetails" },
        body: {
          id: context.broadcastId,
          snippet,
          status,
          contentDetails: existing.contentDetails,
        },
      });

      return {
        broadcastId: context.broadcastId,
        title: updated.snippet?.title ?? "",
        scheduledStartTime: updated.snippet?.scheduledStartTime ?? "",
        lifeCycleStatus: updated.status?.lifeCycleStatus ?? "",
        privacyStatus: updated.status?.privacyStatus ?? "",
        liveChatId: updated.snippet?.liveChatId,
        watchUrl: `https://www.youtube.com/watch?v=${context.broadcastId}`,
      };
    },
  });

// ---------------------------------------------------------------------------
// 4. createDeleteBroadcastTool
// ---------------------------------------------------------------------------

export const createDeleteBroadcastTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_DELETE_BROADCAST",
    description:
      "Delete a broadcast. Only broadcasts in 'complete' or 'created' status can be deleted.",
    inputSchema: z.object({
      broadcastId: z.string(),
    }),
    outputSchema: z.object({
      broadcastId: z.string(),
      deleted: z.boolean(),
    }),
    execute: async ({ context }) => {
      await dataApi(env, "/liveBroadcasts", {
        method: "DELETE",
        params: { id: context.broadcastId },
      });
      return { broadcastId: context.broadcastId, deleted: true };
    },
  });

// ---------------------------------------------------------------------------
// 5. createBindBroadcastTool
// ---------------------------------------------------------------------------

export const createBindBroadcastTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_BIND_BROADCAST",
    description:
      "Bind a broadcast to a live stream (for live streaming) OR to an existing video (for Premieres). Pass streamId for live, videoId for Premiere.",
    inputSchema: z.object({
      broadcastId: z.string(),
      streamId: z
        .string()
        .optional()
        .describe("liveStream id — for live broadcasts"),
      videoId: z
        .string()
        .optional()
        .describe("existing video id — for Premieres"),
    }),
    outputSchema: z.object({
      broadcastId: z.string(),
      boundStreamId: z.string().optional(),
      boundVideoId: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const result = await dataApi<BroadcastItem>(env, "/liveBroadcasts/bind", {
        method: "POST",
        params: {
          id: context.broadcastId,
          part: "id,contentDetails",
          ...(context.streamId && { streamId: context.streamId }),
          ...(context.videoId && { videoId: context.videoId }),
        },
      });
      return {
        broadcastId: context.broadcastId,
        boundStreamId: result.contentDetails?.boundStreamId,
        boundVideoId: result.contentDetails?.videoId,
      };
    },
  });

// ---------------------------------------------------------------------------
// 6. createTransitionBroadcastTool
// ---------------------------------------------------------------------------

export const createTransitionBroadcastTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_TRANSITION_BROADCAST",
    description:
      "Transition a broadcast: 'testing' → test mode, 'live' → go live, 'complete' → end broadcast.",
    inputSchema: z.object({
      broadcastId: z.string(),
      broadcastStatus: z.enum(["testing", "live", "complete"]),
    }),
    outputSchema: z.object({
      broadcastId: z.string(),
      lifeCycleStatus: z.string(),
    }),
    execute: async ({ context }) => {
      const result = await dataApi<BroadcastItem>(
        env,
        "/liveBroadcasts/transition",
        {
          method: "POST",
          params: {
            id: context.broadcastId,
            broadcastStatus: context.broadcastStatus,
            part: "id,status",
          },
        },
      );
      return {
        broadcastId: context.broadcastId,
        lifeCycleStatus: result.status?.lifeCycleStatus ?? "",
      };
    },
  });

// ---------------------------------------------------------------------------
// 7. createListLiveStreamsTool
// ---------------------------------------------------------------------------

export const createListLiveStreamsTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_LIST_LIVE_STREAMS",
    description:
      "List the channel's live stream ingestion points (RTMP endpoints).",
    inputSchema: z.object({
      maxResults: z.coerce.number().int().min(1).max(50).default(25),
      pageToken: z.string().optional(),
    }),
    outputSchema: z.object({
      streams: z.array(
        z.object({
          streamId: z.string(),
          title: z.string(),
          streamStatus: z.string(),
          ingestionType: z.string().optional(),
          ingestionAddress: z.string().optional(),
          streamKey: z.string().optional(),
          backupIngestionAddress: z.string().optional(),
          resolution: z.string().optional(),
          frameRate: z.string().optional(),
        }),
      ),
      nextPageToken: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const data = await dataApi<LiveStreamResponse>(env, "/liveStreams", {
        params: {
          part: "snippet,cdn,status",
          mine: true,
          maxResults: context.maxResults,
          pageToken: context.pageToken,
        },
      });
      return {
        streams: (data.items ?? []).map((item) => ({
          streamId: item.id,
          title: item.snippet?.title ?? "",
          streamStatus: item.status?.streamStatus ?? "",
          ingestionType: item.cdn?.ingestionType,
          ingestionAddress: item.cdn?.ingestionInfo?.ingestionAddress,
          streamKey: item.cdn?.ingestionInfo?.streamName,
          backupIngestionAddress:
            item.cdn?.ingestionInfo?.backupIngestionAddress,
          resolution: item.cdn?.resolution,
          frameRate: item.cdn?.frameRate,
        })),
        nextPageToken: data.nextPageToken,
      };
    },
  });

// ---------------------------------------------------------------------------
// 8. createCreateLiveStreamTool
// ---------------------------------------------------------------------------

export const createCreateLiveStreamTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_CREATE_LIVE_STREAM",
    description:
      "Create a live stream ingestion point. Returns the RTMP URL and stream key for your encoder (OBS, etc.). Bind it to a broadcast with YOUTUBE_ADMIN_BIND_BROADCAST.",
    inputSchema: z.object({
      title: z.string().max(128),
      description: z.string().optional(),
      resolution: z
        .enum(["1080p", "720p", "480p", "360p", "240p", "variable"])
        .default("variable"),
      frameRate: z.enum(["30fps", "60fps", "variable"]).default("variable"),
      ingestionType: z.enum(["rtmp", "dash", "webrtc", "hls"]).default("rtmp"),
    }),
    outputSchema: z.object({
      streamId: z.string(),
      title: z.string(),
      ingestionAddress: z.string(),
      streamKey: z.string(),
      backupIngestionAddress: z.string().optional(),
      resolution: z.string(),
      frameRate: z.string(),
    }),
    execute: async ({ context }) => {
      const item = await dataApi<LiveStreamItem>(env, "/liveStreams", {
        method: "POST",
        params: { part: "snippet,cdn" },
        body: {
          snippet: {
            title: context.title,
            description: context.description,
          },
          cdn: {
            ingestionType: context.ingestionType,
            resolution: context.resolution,
            frameRate: context.frameRate,
          },
        },
      });
      return {
        streamId: item.id,
        title: item.snippet?.title ?? context.title,
        ingestionAddress: item.cdn?.ingestionInfo?.ingestionAddress ?? "",
        streamKey: item.cdn?.ingestionInfo?.streamName ?? "",
        backupIngestionAddress: item.cdn?.ingestionInfo?.backupIngestionAddress,
        resolution: item.cdn?.resolution ?? context.resolution,
        frameRate: item.cdn?.frameRate ?? context.frameRate,
      };
    },
  });

// ---------------------------------------------------------------------------
// 9. createDeleteLiveStreamTool
// ---------------------------------------------------------------------------

export const createDeleteLiveStreamTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_DELETE_LIVE_STREAM",
    description: "Delete a live stream ingestion point.",
    inputSchema: z.object({
      streamId: z.string(),
    }),
    outputSchema: z.object({
      streamId: z.string(),
      deleted: z.boolean(),
    }),
    execute: async ({ context }) => {
      await dataApi(env, "/liveStreams", {
        method: "DELETE",
        params: { id: context.streamId },
      });
      return { streamId: context.streamId, deleted: true };
    },
  });

// ---------------------------------------------------------------------------
// 10. createListLiveChatMessagesTool
// ---------------------------------------------------------------------------

export const createListLiveChatMessagesTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_LIST_LIVE_CHAT",
    description:
      "Read messages from a live broadcast's chat. Use liveChatId from LIST_BROADCASTS or CREATE_BROADCAST output.",
    inputSchema: z.object({
      liveChatId: z.string(),
      maxResults: z.coerce.number().int().min(1).max(2000).default(200),
      pageToken: z.string().optional(),
    }),
    outputSchema: z.object({
      messages: z.array(
        z.object({
          messageId: z.string(),
          authorChannelId: z.string(),
          authorDisplayName: z.string(),
          text: z.string(),
          publishedAt: z.string(),
          type: z.string(),
        }),
      ),
      nextPageToken: z.string().optional(),
      pollingIntervalMillis: z.number().optional(),
    }),
    execute: async ({ context }) => {
      const data = await dataApi<LiveChatMessagesResponse>(
        env,
        "/liveChat/messages",
        {
          params: {
            part: "id,snippet,authorDetails",
            liveChatId: context.liveChatId,
            maxResults: context.maxResults,
            pageToken: context.pageToken,
          },
        },
      );
      return {
        messages: (data.items ?? []).map((item) => ({
          messageId: item.id,
          authorChannelId: item.authorDetails?.channelId ?? "",
          authorDisplayName: item.authorDetails?.displayName ?? "",
          text:
            item.snippet?.displayMessage ??
            item.snippet?.textMessageDetails?.messageText ??
            "",
          publishedAt: item.snippet?.publishedAt ?? "",
          type: item.snippet?.type ?? "",
        })),
        nextPageToken: data.nextPageToken,
        pollingIntervalMillis: data.pollingIntervalMillis,
      };
    },
  });

// ---------------------------------------------------------------------------
// 11. createSendLiveChatMessageTool
// ---------------------------------------------------------------------------

export const createSendLiveChatMessageTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_SEND_LIVE_CHAT_MESSAGE",
    description: "Send a text message to a live broadcast's chat.",
    inputSchema: z.object({
      liveChatId: z.string(),
      text: z.string().min(1).max(200),
    }),
    outputSchema: z.object({
      messageId: z.string(),
      text: z.string(),
      publishedAt: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const result = await dataApi<LiveChatMessageItem>(
        env,
        "/liveChat/messages",
        {
          method: "POST",
          params: { part: "snippet" },
          body: {
            snippet: {
              liveChatId: context.liveChatId,
              type: "textMessageEvent",
              textMessageDetails: { messageText: context.text },
            },
          },
        },
      );
      return {
        messageId: result.id,
        text:
          result.snippet?.textMessageDetails?.messageText ??
          result.snippet?.displayMessage ??
          context.text,
        publishedAt: result.snippet?.publishedAt,
      };
    },
  });

// ---------------------------------------------------------------------------
// 12. createDeleteLiveChatMessageTool
// ---------------------------------------------------------------------------

export const createDeleteLiveChatMessageTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_DELETE_LIVE_CHAT_MESSAGE",
    description: "Delete a message from a live broadcast's chat.",
    inputSchema: z.object({
      messageId: z.string(),
    }),
    outputSchema: z.object({
      messageId: z.string(),
      deleted: z.boolean(),
    }),
    execute: async ({ context }) => {
      await dataApi(env, "/liveChat/messages", {
        method: "DELETE",
        params: { id: context.messageId },
      });
      return { messageId: context.messageId, deleted: true };
    },
  });

// ---------------------------------------------------------------------------
// Shared response interfaces (bans & moderators)
// ---------------------------------------------------------------------------

interface LiveChatBanResponse {
  items?: LiveChatBanItem[];
  nextPageToken?: string;
}

interface LiveChatBanItem {
  id: string;
  snippet?: {
    liveChatId?: string;
    type?: string; // "permanent" | "temporary"
    banDurationSeconds?: number;
    bannedUserDetails?: {
      channelId?: string;
      displayName?: string;
      channelUrl?: string;
    };
  };
}

interface LiveChatModeratorResponse {
  items?: LiveChatModeratorItem[];
  nextPageToken?: string;
}

interface LiveChatModeratorItem {
  id: string;
  snippet?: {
    liveChatId?: string;
    moderatorDetails?: {
      channelId?: string;
      displayName?: string;
      channelUrl?: string;
    };
  };
}

// ---------------------------------------------------------------------------
// 13. createUpdateLiveStreamTool
// ---------------------------------------------------------------------------

export const createUpdateLiveStreamTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_UPDATE_LIVE_STREAM",
    description: "Update a live stream's title, resolution or frame rate.",
    inputSchema: z.object({
      streamId: z.string(),
      title: z.string().max(128).optional(),
      resolution: z
        .enum(["1080p", "720p", "480p", "360p", "240p", "variable"])
        .optional(),
      frameRate: z.enum(["30fps", "60fps", "variable"]).optional(),
    }),
    outputSchema: z.object({
      streamId: z.string(),
      title: z.string(),
      streamStatus: z.string(),
    }),
    execute: async ({ context }) => {
      const current = await dataApi<LiveStreamResponse>(env, "/liveStreams", {
        params: {
          part: "snippet,cdn,status",
          id: context.streamId,
        },
      });
      const existing = current.items?.[0];
      if (!existing) {
        throw new Error(`Live stream ${context.streamId} not found.`);
      }

      const snippet = {
        ...existing.snippet,
        title: context.title ?? existing.snippet?.title,
      };
      const cdn = {
        ...existing.cdn,
        resolution: context.resolution ?? existing.cdn?.resolution,
        frameRate: context.frameRate ?? existing.cdn?.frameRate,
      };

      const updated = await dataApi<LiveStreamItem>(env, "/liveStreams", {
        method: "PUT",
        params: { part: "snippet,cdn" },
        body: {
          id: context.streamId,
          snippet,
          cdn,
        },
      });

      return {
        streamId: context.streamId,
        title: updated.snippet?.title ?? "",
        streamStatus: updated.status?.streamStatus ?? "",
      };
    },
  });

// ---------------------------------------------------------------------------
// 14. createListLiveChatBansTool
// ---------------------------------------------------------------------------

export const createListLiveChatBansTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_LIST_LIVE_CHAT_BANS",
    description: "List users banned from a live chat.",
    inputSchema: z.object({
      liveChatId: z.string(),
      maxResults: z.coerce.number().int().min(1).max(1000).default(500),
      pageToken: z.string().optional(),
    }),
    outputSchema: z.object({
      bans: z.array(
        z.object({
          banId: z.string(),
          channelId: z.string(),
          displayName: z.string(),
          type: z.string(),
          banDurationSeconds: z.number().optional(),
          liveChatId: z.string(),
        }),
      ),
      nextPageToken: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const data = await dataApi<LiveChatBanResponse>(env, "/liveChat/bans", {
        params: {
          part: "id,snippet",
          liveChatId: context.liveChatId,
          maxResults: context.maxResults,
          pageToken: context.pageToken,
        },
      });
      return {
        bans: (data.items ?? []).map((item) => ({
          banId: item.id,
          channelId: item.snippet?.bannedUserDetails?.channelId ?? "",
          displayName: item.snippet?.bannedUserDetails?.displayName ?? "",
          type: item.snippet?.type ?? "",
          banDurationSeconds: item.snippet?.banDurationSeconds,
          liveChatId: item.snippet?.liveChatId ?? "",
        })),
        nextPageToken: data.nextPageToken,
      };
    },
  });

// ---------------------------------------------------------------------------
// 15. createBanLiveChatUserTool
// ---------------------------------------------------------------------------

export const createBanLiveChatUserTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_BAN_LIVE_CHAT_USER",
    description:
      "Ban a user from a live chat. Use type 'permanent' or 'temporary' (with banDurationSeconds).",
    inputSchema: z.object({
      liveChatId: z.string(),
      channelId: z.string().describe("Channel ID of the user to ban"),
      type: z.enum(["permanent", "temporary"]).default("permanent"),
      banDurationSeconds: z
        .number()
        .int()
        .min(300)
        .max(86400)
        .optional()
        .describe("Required if type is temporary (300–86400 seconds)"),
    }),
    outputSchema: z.object({
      banId: z.string(),
      channelId: z.string(),
      type: z.string(),
      banDurationSeconds: z.number().optional(),
    }),
    execute: async ({ context }) => {
      const item = await dataApi<LiveChatBanItem>(env, "/liveChat/bans", {
        method: "POST",
        params: { part: "snippet" },
        body: {
          snippet: {
            liveChatId: context.liveChatId,
            type: context.type,
            banDurationSeconds: context.banDurationSeconds,
            bannedUserDetails: { channelId: context.channelId },
          },
        },
      });
      return {
        banId: item.id,
        channelId:
          item.snippet?.bannedUserDetails?.channelId ?? context.channelId,
        type: item.snippet?.type ?? context.type,
        banDurationSeconds: item.snippet?.banDurationSeconds,
      };
    },
  });

// ---------------------------------------------------------------------------
// 16. createUnbanLiveChatUserTool
// ---------------------------------------------------------------------------

export const createUnbanLiveChatUserTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_UNBAN_LIVE_CHAT_USER",
    description: "Remove a ban from a live chat user.",
    inputSchema: z.object({
      banId: z.string(),
    }),
    outputSchema: z.object({
      banId: z.string(),
      deleted: z.boolean(),
    }),
    execute: async ({ context }) => {
      await dataApi(env, "/liveChat/bans", {
        method: "DELETE",
        params: { id: context.banId },
      });
      return { banId: context.banId, deleted: true };
    },
  });

// ---------------------------------------------------------------------------
// 17. createListLiveChatModeratorsTool
// ---------------------------------------------------------------------------

export const createListLiveChatModeratorsTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_LIST_LIVE_CHAT_MODERATORS",
    description: "List moderators of a live chat.",
    inputSchema: z.object({
      liveChatId: z.string(),
      maxResults: z.coerce.number().int().min(1).max(1000).default(250),
      pageToken: z.string().optional(),
    }),
    outputSchema: z.object({
      moderators: z.array(
        z.object({
          moderatorId: z.string(),
          channelId: z.string(),
          displayName: z.string(),
          channelUrl: z.string().optional(),
          liveChatId: z.string(),
        }),
      ),
      nextPageToken: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const data = await dataApi<LiveChatModeratorResponse>(
        env,
        "/liveChat/moderators",
        {
          params: {
            part: "id,snippet",
            liveChatId: context.liveChatId,
            maxResults: context.maxResults,
            pageToken: context.pageToken,
          },
        },
      );
      return {
        moderators: (data.items ?? []).map((item) => ({
          moderatorId: item.id,
          channelId: item.snippet?.moderatorDetails?.channelId ?? "",
          displayName: item.snippet?.moderatorDetails?.displayName ?? "",
          channelUrl: item.snippet?.moderatorDetails?.channelUrl,
          liveChatId: item.snippet?.liveChatId ?? "",
        })),
        nextPageToken: data.nextPageToken,
      };
    },
  });

// ---------------------------------------------------------------------------
// 18. createAddLiveChatModeratorTool
// ---------------------------------------------------------------------------

export const createAddLiveChatModeratorTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_ADD_LIVE_CHAT_MODERATOR",
    description: "Add a moderator to a live chat.",
    inputSchema: z.object({
      liveChatId: z.string(),
      channelId: z
        .string()
        .describe("Channel ID of the user to make moderator"),
    }),
    outputSchema: z.object({
      moderatorId: z.string(),
      channelId: z.string(),
      displayName: z.string(),
      liveChatId: z.string(),
    }),
    execute: async ({ context }) => {
      const item = await dataApi<LiveChatModeratorItem>(
        env,
        "/liveChat/moderators",
        {
          method: "POST",
          params: { part: "snippet" },
          body: {
            snippet: {
              liveChatId: context.liveChatId,
              moderatorDetails: { channelId: context.channelId },
            },
          },
        },
      );
      return {
        moderatorId: item.id,
        channelId:
          item.snippet?.moderatorDetails?.channelId ?? context.channelId,
        displayName: item.snippet?.moderatorDetails?.displayName ?? "",
        liveChatId: item.snippet?.liveChatId ?? context.liveChatId,
      };
    },
  });

// ---------------------------------------------------------------------------
// 19. createRemoveLiveChatModeratorTool
// ---------------------------------------------------------------------------

export const createRemoveLiveChatModeratorTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_REMOVE_LIVE_CHAT_MODERATOR",
    description: "Remove a moderator from a live chat.",
    inputSchema: z.object({
      moderatorId: z.string(),
    }),
    outputSchema: z.object({
      moderatorId: z.string(),
      deleted: z.boolean(),
    }),
    execute: async ({ context }) => {
      await dataApi(env, "/liveChat/moderators", {
        method: "DELETE",
        params: { id: context.moderatorId },
      });
      return { moderatorId: context.moderatorId, deleted: true };
    },
  });
