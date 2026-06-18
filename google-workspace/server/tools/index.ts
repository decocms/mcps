/**
 * Google Workspace tools = the union of our existing Google REST-based MCPs,
 * each tool's id namespaced with the service prefix to avoid collisions.
 *
 * We pull from the productivity-focused MCPs that share the same OAuth flow.
 * Chat and People are intentionally excluded — Google's official MCP servers
 * for them require additional scope verification we haven't completed.
 */

import { tools as calendarTools } from "google-calendar/tools";
import { basicTools as gmailTools } from "google-gmail/tools";
import { tools as driveTools } from "google-drive/tools";
import { tools as docsTools } from "google-docs/tools";
import { tools as sheetsTools } from "google-sheets/tools";
import { tools as slidesTools } from "google-slides/tools";
import { tools as formsTools } from "google-forms/tools";
import { tools as meetTools } from "google-meet/tools";

import { prefixToolFactories } from "../lib/prefix-tool.ts";

export const tools = [
  ...prefixToolFactories(calendarTools, "calendar"),
  ...prefixToolFactories(gmailTools, "gmail"),
  ...prefixToolFactories(driveTools, "drive"),
  ...prefixToolFactories(docsTools, "docs"),
  ...prefixToolFactories(sheetsTools, "sheets"),
  ...prefixToolFactories(slidesTools, "slides"),
  ...prefixToolFactories(formsTools, "forms"),
  ...prefixToolFactories(meetTools, "meet"),
];
