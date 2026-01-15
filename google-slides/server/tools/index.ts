/**
 * Central export for all Google Slides tools
 */

import { presentationTools } from "./presentations.ts";
import { slideTools } from "./slides.ts";
import { elementTools } from "./elements.ts";

export const tools = [...presentationTools, ...slideTools, ...elementTools];
