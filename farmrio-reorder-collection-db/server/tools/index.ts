import { collectionCreateTool } from "./collections/collection-create.ts";
import { collectionGetTool } from "./collections/collection-get.ts";
import { collectionListTool } from "./collections/collection-list.ts";
import { collectionUpdateTool } from "./collections/collection-update.ts";
import { reportCreateTool } from "./reports/report-create.ts";
import { reportGetTool } from "./reports/report-get.ts";
import { reportListTool } from "./reports/report-list.ts";
import { reportUpdateTool } from "./reports/report-update.ts";

export const tools = [
  reportListTool,
  reportGetTool,
  reportCreateTool,
  reportUpdateTool,
  collectionListTool,
  collectionGetTool,
  collectionCreateTool,
  collectionUpdateTool,
];
