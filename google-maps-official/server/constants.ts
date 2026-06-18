import snapshot from "./tools/generated/maps.json" with { type: "json" };
import type { BackendToolDefinition } from "@decocms/mcps-shared/google-mcp";

export const BACKEND_URL = "https://mapstools.googleapis.com/mcp";

export interface BackendSnapshot {
  service: string;
  url: string;
  scopes: string[];
  tools: BackendToolDefinition[];
}

export const TOOL_SNAPSHOT = snapshot as BackendSnapshot;

export const SCOPES: string[] = TOOL_SNAPSHOT.scopes;
