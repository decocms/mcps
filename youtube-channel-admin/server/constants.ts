export const DATA_API_BASE = "https://www.googleapis.com/youtube/v3";
export const UPLOAD_API_BASE = "https://www.googleapis.com/upload/youtube/v3";
export const ANALYTICS_API_BASE =
  "https://youtubeanalytics.googleapis.com/v2/reports";

/**
 * Minimal scope set (all "sensitive" — users see Google's unverified-app
 * interstitial until the shared client passes per-scope review):
 * - youtube.force-ssl: videos/channels list+update, thumbnails.set,
 *   captions, commentThreads and comment moderation (moderation REQUIRES
 *   force-ssl; the plain `youtube` scope can't moderate).
 * - youtube.upload: videos.insert (resumable upload).
 * - yt-analytics.readonly: Analytics API reports for the dashboard/widgets.
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

export const DASHBOARD_RESOURCE_URI = "ui://youtube-channel-admin/dashboard";
export const WIDGET_TOP_VIDEOS_RESOURCE_URI =
  "ui://youtube-channel-admin/widget-top-videos";
export const WIDGET_PERFORMANCE_RESOURCE_URI =
  "ui://youtube-channel-admin/widget-performance";
export const WIDGET_ALERTS_RESOURCE_URI =
  "ui://youtube-channel-admin/widget-alerts";
export const WIDGET_LIVES_RESOURCE_URI =
  "ui://youtube-channel-admin/widget-lives";
