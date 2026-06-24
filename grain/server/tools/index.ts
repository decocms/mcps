import { createListRecordingsTool } from "./list-recordings.ts";
import { createGetRecordingTool } from "./get-recording.ts";
import { createSearchIndexedRecordingsTool } from "./search-indexed-recordings.ts";
import { createGetTranscriptTool } from "./get-transcript.ts";
import { createGetSummaryTool } from "./get-summary.ts";
import { triggers } from "../triggers/store.ts";

export const tools = [
  createListRecordingsTool,
  createGetRecordingTool,
  createGetTranscriptTool,
  createGetSummaryTool,
  createSearchIndexedRecordingsTool,
  () => triggers.tools(),
];
