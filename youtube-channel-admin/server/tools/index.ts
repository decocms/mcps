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
  createSetWatermarkTool,
  createUnsetWatermarkTool,
  createUpdateChannelTool,
} from "./channel.ts";
import {
  createCreateChannelSectionTool,
  createDeleteChannelSectionTool,
  createListChannelSectionsTool,
  createUpdateChannelSectionTool,
} from "./channel-sections.ts";
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
  createAddLiveChatModeratorTool,
  createBanLiveChatUserTool,
  createBindBroadcastTool,
  createCreateBroadcastTool,
  createCreateLiveStreamTool,
  createDeleteBroadcastTool,
  createDeleteLiveChatMessageTool,
  createDeleteLiveStreamTool,
  createListBroadcastsTool,
  createListLiveChatBansTool,
  createListLiveChatMessagesTool,
  createListLiveChatModeratorsTool,
  createListLiveStreamsTool,
  createRemoveLiveChatModeratorTool,
  createSendLiveChatMessageTool,
  createTransitionBroadcastTool,
  createUnbanLiveChatUserTool,
  createUpdateBroadcastTool,
  createUpdateLiveStreamTool,
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
  createLivesWidgetTool,
  createPerformanceWidgetTool,
  createTopVideosWidgetTool,
} from "./widgets.ts";

export const tools = [
  // channel
  createGetMyChannelTool,
  createUpdateChannelTool,
  createListVideoCategoryTool,
  createListSubscribersTool,
  createSetWatermarkTool,
  createUnsetWatermarkTool,
  // channel sections
  createListChannelSectionsTool,
  createCreateChannelSectionTool,
  createUpdateChannelSectionTool,
  createDeleteChannelSectionTool,
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
  createUpdateLiveStreamTool,
  createDeleteLiveStreamTool,
  createListLiveChatMessagesTool,
  createSendLiveChatMessageTool,
  createDeleteLiveChatMessageTool,
  createListLiveChatBansTool,
  createBanLiveChatUserTool,
  createUnbanLiveChatUserTool,
  createListLiveChatModeratorsTool,
  createAddLiveChatModeratorTool,
  createRemoveLiveChatModeratorTool,
  // analytics
  createQueryAnalyticsTool,
  // ui
  createDashboardTool,
  createTopVideosWidgetTool,
  createPerformanceWidgetTool,
  createAlertsWidgetTool,
  createLivesWidgetTool,
];
