/**
 * Central export for all Google Meet tools
 */

import { spaceTools } from "./spaces.ts";
import { conferenceTools } from "./conferences.ts";
import { recordingTools } from "./recordings.ts";

export const tools = [...spaceTools, ...conferenceTools, ...recordingTools];
