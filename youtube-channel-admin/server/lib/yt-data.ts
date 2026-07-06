/**
 * Data-fetch helpers shared by the individual tools, the dashboard and the
 * home widgets.
 */
import type { Env } from "../types/env.ts";
import {
  analyticsApi,
  dataApi,
  parseIsoDuration,
  toApiDate,
} from "./yt-client.ts";

// ---------- Raw Data API shapes (only the fields we read) ----------

interface ChannelListResponse {
  items?: Array<{
    id: string;
    snippet?: {
      title?: string;
      description?: string;
      customUrl?: string;
      publishedAt?: string;
      thumbnails?: Record<string, { url?: string }>;
    };
    statistics?: {
      viewCount?: string;
      subscriberCount?: string;
      videoCount?: string;
    };
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  }>;
}

interface PlaylistItemsResponse {
  items?: Array<{ contentDetails?: { videoId?: string } }>;
  nextPageToken?: string;
}

export interface VideoListResponse {
  items?: Array<{
    id: string;
    snippet?: {
      title?: string;
      description?: string;
      tags?: string[];
      categoryId?: string;
      publishedAt?: string;
      thumbnails?: Record<string, { url?: string }>;
    };
    status?: {
      privacyStatus?: string;
      uploadStatus?: string;
      failureReason?: string;
      rejectionReason?: string;
    };
    statistics?: {
      viewCount?: string;
      likeCount?: string;
      commentCount?: string;
    };
    contentDetails?: { duration?: string };
    processingDetails?: {
      processingStatus?: string;
      processingIssuesAvailability?: string;
    };
    suggestions?: {
      processingErrors?: string[];
      processingWarnings?: string[];
      tagSuggestions?: Array<{ tag?: string }>;
    };
  }>;
  nextPageToken?: string;
}

// ---------- Mapped views ----------

export interface MyChannel {
  channelId: string;
  title: string;
  customUrl?: string;
  thumbnailUrl?: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  uploadsPlaylistId?: string;
}

export interface MyVideo {
  videoId: string;
  title: string;
  description: string;
  tags: string[];
  categoryId?: string;
  privacyStatus?: string;
  publishedAt?: string;
  durationSeconds?: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  thumbnailUrl?: string;
  watchUrl: string;
  uploadStatus?: string;
  failureReason?: string;
  rejectionReason?: string;
  processingStatus?: string;
  processingErrors: string[];
  processingWarnings: string[];
}

export async function getMyChannel(env: Env): Promise<MyChannel> {
  const data = await dataApi<ChannelListResponse>(env, "/channels", {
    params: { part: "snippet,statistics,contentDetails", mine: true },
  });
  const channel = data.items?.[0];
  if (!channel) {
    throw new Error(
      "No YouTube channel found for this Google account. Make sure the account owns a channel.",
    );
  }
  return {
    channelId: channel.id,
    title: channel.snippet?.title ?? "",
    customUrl: channel.snippet?.customUrl,
    thumbnailUrl:
      channel.snippet?.thumbnails?.medium?.url ??
      channel.snippet?.thumbnails?.default?.url,
    subscriberCount: Number(channel.statistics?.subscriberCount ?? 0),
    videoCount: Number(channel.statistics?.videoCount ?? 0),
    viewCount: Number(channel.statistics?.viewCount ?? 0),
    uploadsPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads,
  };
}

export function mapVideo(
  item: NonNullable<VideoListResponse["items"]>[number],
): MyVideo {
  return {
    videoId: item.id,
    title: item.snippet?.title ?? "",
    description: item.snippet?.description ?? "",
    tags: item.snippet?.tags ?? [],
    categoryId: item.snippet?.categoryId,
    privacyStatus: item.status?.privacyStatus,
    publishedAt: item.snippet?.publishedAt,
    durationSeconds: parseIsoDuration(item.contentDetails?.duration),
    viewCount: Number(item.statistics?.viewCount ?? 0),
    likeCount: Number(item.statistics?.likeCount ?? 0),
    commentCount: Number(item.statistics?.commentCount ?? 0),
    thumbnailUrl:
      item.snippet?.thumbnails?.medium?.url ??
      item.snippet?.thumbnails?.default?.url,
    watchUrl: `https://www.youtube.com/watch?v=${item.id}`,
    uploadStatus: item.status?.uploadStatus,
    failureReason: item.status?.failureReason,
    rejectionReason: item.status?.rejectionReason,
    processingStatus: item.processingDetails?.processingStatus,
    processingErrors: item.suggestions?.processingErrors ?? [],
    processingWarnings: item.suggestions?.processingWarnings ?? [],
  };
}

/** Owner-only parts are allowed because the OAuth user owns these videos. */
const OWNER_VIDEO_PARTS =
  "snippet,status,statistics,contentDetails,processingDetails,suggestions";

export async function getVideosByIds(
  env: Env,
  ids: string[],
): Promise<MyVideo[]> {
  if (ids.length === 0) return [];
  const data = await dataApi<VideoListResponse>(env, "/videos", {
    params: { part: OWNER_VIDEO_PARTS, id: ids.join(","), maxResults: 50 },
  });
  return (data.items ?? []).map(mapVideo);
}

export async function listMyVideos(
  env: Env,
  options: { maxResults?: number; pageToken?: string } = {},
): Promise<{ videos: MyVideo[]; nextPageToken?: string }> {
  const channel = await getMyChannel(env);
  if (!channel.uploadsPlaylistId) {
    return { videos: [] };
  }
  // The uploads playlist costs 1 quota unit per page vs 100 for search.list.
  const playlist = await dataApi<PlaylistItemsResponse>(env, "/playlistItems", {
    params: {
      part: "contentDetails",
      playlistId: channel.uploadsPlaylistId,
      maxResults: Math.min(options.maxResults ?? 25, 50),
      pageToken: options.pageToken,
    },
  });
  const ids = (playlist.items ?? [])
    .map((item) => item.contentDetails?.videoId)
    .filter((id): id is string => !!id);
  return {
    videos: await getVideosByIds(env, ids),
    nextPageToken: playlist.nextPageToken,
  };
}

// ---------- Analytics summaries (dashboard/widgets) ----------

export interface TopVideo {
  videoId: string;
  title: string;
  thumbnailUrl?: string;
  watchUrl: string;
  views: number;
  watchMinutes: number;
  likes: number;
}

export async function getTopVideos(
  env: Env,
  options: { days?: number; limit?: number } = {},
): Promise<{ topVideos: TopVideo[]; startDate: string; endDate: string }> {
  const days = options.days ?? 28;
  const endDate = toApiDate(new Date());
  const startDate = toApiDate(new Date(Date.now() - days * 86_400_000));

  const report = await analyticsApi(env, {
    startDate,
    endDate,
    metrics: "views,estimatedMinutesWatched,likes",
    dimensions: "video",
    sort: "-views",
    maxResults: options.limit ?? 5,
  });

  const rows = report.rows ?? [];
  const ids = rows.map((row) => String(row[0]));
  const details = await getVideosByIds(env, ids);
  const byId = new Map(details.map((video) => [video.videoId, video]));

  return {
    startDate,
    endDate,
    topVideos: rows.map((row) => {
      const videoId = String(row[0]);
      const video = byId.get(videoId);
      return {
        videoId,
        title: video?.title ?? videoId,
        thumbnailUrl: video?.thumbnailUrl,
        watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
        views: Number(row[1] ?? 0),
        watchMinutes: Number(row[2] ?? 0),
        likes: Number(row[3] ?? 0),
      };
    }),
  };
}

export interface PerformanceSummary {
  startDate: string;
  endDate: string;
  totals: {
    views: number;
    watchMinutes: number;
    likes: number;
    comments: number;
    subscribersGained: number;
    subscribersLost: number;
  };
  daily: Array<{ date: string; views: number }>;
}

export async function getPerformance(
  env: Env,
  options: { days?: number } = {},
): Promise<PerformanceSummary> {
  const days = options.days ?? 28;
  const endDate = toApiDate(new Date());
  const startDate = toApiDate(new Date(Date.now() - days * 86_400_000));

  const report = await analyticsApi(env, {
    startDate,
    endDate,
    metrics:
      "views,estimatedMinutesWatched,likes,comments,subscribersGained,subscribersLost",
    dimensions: "day",
    sort: "day",
  });

  const totals = {
    views: 0,
    watchMinutes: 0,
    likes: 0,
    comments: 0,
    subscribersGained: 0,
    subscribersLost: 0,
  };
  const daily: Array<{ date: string; views: number }> = [];

  for (const row of report.rows ?? []) {
    const [date, views, watch, likes, comments, gained, lost] = row;
    totals.views += Number(views ?? 0);
    totals.watchMinutes += Number(watch ?? 0);
    totals.likes += Number(likes ?? 0);
    totals.comments += Number(comments ?? 0);
    totals.subscribersGained += Number(gained ?? 0);
    totals.subscribersLost += Number(lost ?? 0);
    daily.push({ date: String(date), views: Number(views ?? 0) });
  }

  return { startDate, endDate, totals, daily };
}

// ---------- Alerts (videos with problems + moderation queue) ----------

export interface ChannelAlert {
  severity: "error" | "warning";
  kind:
    | "upload_failed"
    | "upload_rejected"
    | "processing_failed"
    | "processing_warning"
    | "comments_held_for_review";
  videoId?: string;
  title?: string;
  message: string;
}

interface CommentThreadsCountResponse {
  pageInfo?: { totalResults?: number };
  items?: unknown[];
}

export async function getAlerts(env: Env): Promise<{
  alerts: ChannelAlert[];
  counts: {
    failed: number;
    rejected: number;
    processing: number;
    heldForReview: number;
  };
}> {
  const [{ videos }, channel] = await Promise.all([
    listMyVideos(env, { maxResults: 50 }),
    getMyChannel(env),
  ]);

  const alerts: ChannelAlert[] = [];
  const counts = { failed: 0, rejected: 0, processing: 0, heldForReview: 0 };

  for (const video of videos) {
    if (video.uploadStatus === "failed") {
      counts.failed++;
      alerts.push({
        severity: "error",
        kind: "upload_failed",
        videoId: video.videoId,
        title: video.title,
        message: `Upload failed${video.failureReason ? `: ${video.failureReason}` : ""}`,
      });
    }
    if (video.uploadStatus === "rejected") {
      counts.rejected++;
      alerts.push({
        severity: "error",
        kind: "upload_rejected",
        videoId: video.videoId,
        title: video.title,
        // rejectionReason covers copyright ("claim"/"copyright"), TOS, etc.
        message: `Video rejected${video.rejectionReason ? `: ${video.rejectionReason}` : ""}`,
      });
    }
    if (video.processingStatus === "failed") {
      counts.processing++;
      alerts.push({
        severity: "error",
        kind: "processing_failed",
        videoId: video.videoId,
        title: video.title,
        message: `Processing failed${video.processingErrors.length ? `: ${video.processingErrors.join(", ")}` : ""}`,
      });
    }
    if (video.processingWarnings.length > 0) {
      alerts.push({
        severity: "warning",
        kind: "processing_warning",
        videoId: video.videoId,
        title: video.title,
        message: `Processing warnings: ${video.processingWarnings.join(", ")}`,
      });
    }
  }

  try {
    const held = await dataApi<CommentThreadsCountResponse>(
      env,
      "/commentThreads",
      {
        params: {
          part: "id",
          allThreadsRelatedToChannelId: channel.channelId,
          moderationStatus: "heldForReview",
          maxResults: 50,
        },
      },
    );
    counts.heldForReview = held.items?.length ?? 0;
    if (counts.heldForReview > 0) {
      alerts.push({
        severity: "warning",
        kind: "comments_held_for_review",
        message: `${counts.heldForReview}${counts.heldForReview === 50 ? "+" : ""} comment thread(s) held for review`,
      });
    }
  } catch {
    // Comment moderation queue is best-effort (some channels disable comments).
  }

  return { alerts, counts };
}
