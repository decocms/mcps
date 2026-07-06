export type McpStatus =
  | "initializing"
  | "connected"
  | "tool-input"
  | "tool-result"
  | "tool-cancelled"
  | "error";

export interface McpState<TInput = unknown, TResult = unknown> {
  status: McpStatus;
  toolName?: string;
  error?: string;
  toolInput?: TInput;
  toolResult?: TResult;
}

export const INITIAL_STATE: McpState = { status: "initializing" };

/* ---- mirrors of the server view shapes (server/tools/views.ts) ---- */

export interface MyChannel {
  channelId: string;
  title: string;
  customUrl?: string;
  thumbnailUrl?: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
}

export interface MyVideo {
  videoId: string;
  title: string;
  description: string;
  tags: string[];
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

export interface TopVideo {
  videoId: string;
  title: string;
  thumbnailUrl?: string;
  watchUrl: string;
  views: number;
  watchMinutes: number;
  likes: number;
}

export interface Performance {
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

export interface ChannelAlert {
  severity: "error" | "warning";
  kind: string;
  videoId?: string;
  title?: string;
  message: string;
}

export interface AlertCounts {
  failed: number;
  rejected: number;
  processing: number;
  heldForReview: number;
}

export interface TopVideosWidgetData {
  topVideos: TopVideo[];
  startDate: string;
  endDate: string;
  updatedAt: string;
}

export interface PerformanceWidgetData {
  performance: Performance;
  channel: {
    title: string;
    subscriberCount: number;
    thumbnailUrl?: string;
  };
  updatedAt: string;
}

export interface AlertsWidgetData {
  alerts: ChannelAlert[];
  counts: AlertCounts;
  updatedAt: string;
}

export interface DashboardData {
  channel: MyChannel;
  performance: Performance;
  topVideos: TopVideo[];
  alerts: ChannelAlert[];
  alertCounts: AlertCounts;
  recentVideos: MyVideo[];
  updatedAt: string;
}
