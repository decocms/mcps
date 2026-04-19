import { queryAnalyticsDashboard } from "./analytics.ts";
import { listSessionRecordings } from "./recordings.ts";
import { queryDocumentationResources } from "./docs.ts";

export const tools = [
  queryAnalyticsDashboard,
  listSessionRecordings,
  queryDocumentationResources,
];
