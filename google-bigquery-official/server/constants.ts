import snapshot from "./tools/generated/bigquery.json" with { type: "json" };
import type { BackendToolDefinition } from "@decocms/mcps-shared/google-mcp";

export const BACKEND_URL = "https://bigquery.googleapis.com/mcp";

export interface BackendSnapshot {
  service: string;
  url: string;
  scopes: string[];
  tools: BackendToolDefinition[];
}

export const TOOL_SNAPSHOT = snapshot as BackendSnapshot;

export const SCOPES: string[] = TOOL_SNAPSHOT.scopes;
