import { createListRecordingsTool } from "./list-recordings.ts";
import { createGetRecordingTool } from "./get-recording.ts";
import { createSearchIndexedRecordingsTool } from "./search-indexed-recordings.ts";

export const tools = [
  createListRecordingsTool,
  createGetRecordingTool,
  createSearchIndexedRecordingsTool,
];
