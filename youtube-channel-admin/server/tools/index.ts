import { createQueryAnalyticsTool } from "./analytics.ts";
import {
  createDeleteCaptionTool,
  createGetMyVideoTranscriptTool,
  createListMyCaptionsTool,
  createUpdateCaptionTool,
  createUploadCaptionTool,
} from "./captions.ts";
import {
  createGetMyChannelTool,
  createListSubscribersTool,
  createListVideoCategoryTool,
  createUpdateChannelTool,
} from "./channel.ts";
import {
  createDeleteCommentTool,
  createCommentOnVideoTool,
  createListCommentsTool,
  createModerateCommentTool,
  createReplyCommentTool,
  createUpdateCommentTool,
} from "./comments.ts";
import { createDashboardTool } from "./dashboard.ts";
import {
  createBindBroadcastTool,
  createCreateBroadcastTool,
  createCreateLiveStreamTool,
  createDeleteBroadcastTool,
  createDeleteLiveChatMessageTool,
  createDeleteLiveStreamTool,
  createListBroadcastsTool,
  createListLiveChatMessagesTool,
  createListLiveStreamsTool,
  createSendLiveChatMessageTool,
  createTransitionBroadcastTool,
  createUpdateBroadcastTool,
} from "./live.ts";
import {
  createAddToPlaylistTool,
  createCreatePlaylistTool,
  createDeletePlaylistTool,
  createListPlaylistItemsTool,
  createListPlaylistsTool,
  createRemoveFromPlaylistTool,
  createUpdatePlaylistTool,
} from "./playlists.ts";
import { createSearchMyVideosTool } from "./search.ts";
import { createUploadVideoTool } from "./upload.ts";
import {
  createDeleteVideoTool,
  createGetVideosTool,
  createListMyVideosTool,
  createRateVideoTool,
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
  createListVideoCategoryTool,
  createListSubscribersTool,
  // search
  createSearchMyVideosTool,
  // videos
  createListMyVideosTool,
  createGetVideosTool,
  createUpdateVideoTool,
  createSetThumbnailTool,
  createUploadVideoTool,
  createDeleteVideoTool,
  createRateVideoTool,
  // captions
  createListMyCaptionsTool,
  createGetMyVideoTranscriptTool,
  createUploadCaptionTool,
  createUpdateCaptionTool,
  createDeleteCaptionTool,
  // playlists
  createListPlaylistsTool,
  createCreatePlaylistTool,
  createUpdatePlaylistTool,
  createDeletePlaylistTool,
  createAddToPlaylistTool,
  createListPlaylistItemsTool,
  createRemoveFromPlaylistTool,
  // comments
  createListCommentsTool,
  createCommentOnVideoTool,
  createReplyCommentTool,
  createUpdateCommentTool,
  createDeleteCommentTool,
  createModerateCommentTool,
  // live streaming
  createListBroadcastsTool,
  createCreateBroadcastTool,
  createUpdateBroadcastTool,
  createDeleteBroadcastTool,
  createBindBroadcastTool,
  createTransitionBroadcastTool,
  createListLiveStreamsTool,
  createCreateLiveStreamTool,
  createDeleteLiveStreamTool,
  createListLiveChatMessagesTool,
  createSendLiveChatMessageTool,
  createDeleteLiveChatMessageTool,
  // analytics
  createQueryAnalyticsTool,
  // ui
  createDashboardTool,
  createTopVideosWidgetTool,
  createPerformanceWidgetTool,
  createAlertsWidgetTool,
];
