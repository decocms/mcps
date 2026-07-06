import { createQueryAnalyticsTool } from "./analytics.ts";
import {
  createGetMyVideoTranscriptTool,
  createListMyCaptionsTool,
  createUploadCaptionTool,
} from "./captions.ts";
import { createGetMyChannelTool, createUpdateChannelTool } from "./channel.ts";
import {
  createAddToPlaylistTool,
  createCreatePlaylistTool,
} from "./playlists.ts";
import {
  createCommentOnVideoTool,
  createListCommentsTool,
  createModerateCommentTool,
  createReplyCommentTool,
} from "./comments.ts";
import { createDashboardTool } from "./dashboard.ts";
import { createUploadVideoTool } from "./upload.ts";
import {
  createGetVideosTool,
  createListMyVideosTool,
  createSetThumbnailTool,
  createUpdateVideoTool,
} from "./videos.ts";
import {
  createAlertsWidgetTool,
  createPerformanceWidgetTool,
  createTopVideosWidgetTool,
} from "./widgets.ts";

export const tools = [
  // channel
  createGetMyChannelTool,
  createUpdateChannelTool,
  // videos
  createListMyVideosTool,
  createGetVideosTool,
  createUpdateVideoTool,
  createSetThumbnailTool,
  createUploadVideoTool,
  // captions
  createListMyCaptionsTool,
  createGetMyVideoTranscriptTool,
  createUploadCaptionTool,
  // playlists
  createCreatePlaylistTool,
  createAddToPlaylistTool,
  // comments
  createListCommentsTool,
  createReplyCommentTool,
  createCommentOnVideoTool,
  createModerateCommentTool,
  // analytics
  createQueryAnalyticsTool,
  // ui
  createDashboardTool,
  createTopVideosWidgetTool,
  createPerformanceWidgetTool,
  createAlertsWidgetTool,
];
