import { createGetTranscriptTool, createListCaptionsTool } from "./captions.ts";
import { createDownloadVideoTool } from "./download.ts";
import { createSearchVideosTool } from "./search.ts";
import { createGetVideoDetailsTool } from "./video-details.ts";

export const tools = [
  createSearchVideosTool,
  createGetVideoDetailsTool,
  createListCaptionsTool,
  createGetTranscriptTool,
  createDownloadVideoTool,
];
