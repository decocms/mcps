import { createListRecordingsTool } from "./list-recordings.ts";
import { createGetRecordingTool } from "./get-recording.ts";

export const tools = [createListRecordingsTool, createGetRecordingTool];
