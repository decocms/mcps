import { createListRecordingsTool } from "./list-recordings.ts";
import { createGetRecordingTool } from "./get-recording.ts";
import { createSearchIndexedRecordingsTool } from "./search-indexed-recordings.ts";
import { createGetTranscriptTool } from "./get-transcript.ts";
import { createGetSummaryTool } from "./get-summary.ts";

export const tools = [
  createListRecordingsTool,
  createGetRecordingTool,
  createGetTranscriptTool,
  createGetSummaryTool,
  createSearchIndexedRecordingsTool,
];
