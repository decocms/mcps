/**
 * Google Workspace MCP — backend endpoints and OAuth scopes.
 *
 * To add a new Google service:
 *   1. Add an entry to BACKEND_MCPS below
 *   2. Run `bun run generate-tools` to fetch its tools/list and PRM scopes
 *   3. The generator will rewrite server/tools/generated/<service>.json
 *      and the runtime will pick it up automatically
 */

export type GoogleService = "calendar" | "chat" | "drive" | "gmail" | "people";

export const BACKEND_MCPS: Record<GoogleService, string> = {
  calendar: "https://calendarmcp.googleapis.com/mcp/v1",
  chat: "https://chatmcp.googleapis.com/mcp/v1",
  drive: "https://drivemcp.googleapis.com/mcp/v1",
  gmail: "https://gmailmcp.googleapis.com/mcp/v1",
  people: "https://people.googleapis.com/mcp/v1",
};

import calendarSnap from "./tools/generated/calendar.json" with { type: "json" };
import chatSnap from "./tools/generated/chat.json" with { type: "json" };
import driveSnap from "./tools/generated/drive.json" with { type: "json" };
import gmailSnap from "./tools/generated/gmail.json" with { type: "json" };
import peopleSnap from "./tools/generated/people.json" with { type: "json" };

export const TOOL_SNAPSHOTS: Record<GoogleService, BackendSnapshot> = {
  calendar: calendarSnap as BackendSnapshot,
  chat: chatSnap as BackendSnapshot,
  drive: driveSnap as BackendSnapshot,
  gmail: gmailSnap as BackendSnapshot,
  people: peopleSnap as BackendSnapshot,
};

export interface BackendToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export interface BackendSnapshot {
  service: GoogleService;
  scopes: string[];
  tools: BackendToolDefinition[];
}

/**
 * Union of every scope advertised by every backend's PRM.
 * Sent to Google's authorization endpoint at consent time.
 */
export const GOOGLE_WORKSPACE_SCOPES: string[] = Array.from(
  new Set(Object.values(TOOL_SNAPSHOTS).flatMap((snap) => snap.scopes)),
).sort();
