/**
 * Central export for all Google Forms tools
 */

import { formTools } from "./forms.ts";
import { questionTools } from "./questions.ts";
import { responseTools } from "./responses.ts";

export const tools = [...formTools, ...questionTools, ...responseTools];
