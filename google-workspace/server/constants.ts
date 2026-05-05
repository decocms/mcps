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
 * Curated minimal set of OAuth scopes sent to Google's authorization endpoint.
 *
 * Each backend's PRM advertises every scope it accepts (e.g. Calendar lists 9
 * variants like `calendar`, `calendar.readonly`, `calendar.events.owned`...).
 * Google's scope hierarchy means the broadest scope per service implicitly
 * grants the narrower ones — so we ask for only the broadest sensible scope
 * each service actually needs to power its tool catalog. This:
 *
 *  - keeps the consent screen short (10 scopes vs 26)
 *  - reduces the chance of "scope not configured in OAuth client" silent drops
 *  - matches the principle of least privilege at consent time
 *
 * If Google adds a tool requiring a scope not listed here, extend the array
 * for the relevant service. Re-running `generate-tools` does NOT touch this
 * list — it's hand-curated against the tool catalog.
 */
export const GOOGLE_WORKSPACE_SCOPES: string[] = [
  // Calendar — full read/write covers all .readonly/.events.* sub-scopes.
  "https://www.googleapis.com/auth/calendar",
  // Chat — three orthogonal scopes. The .readonly variants are subsets.
  "https://www.googleapis.com/auth/chat.spaces",
  "https://www.googleapis.com/auth/chat.messages",
  "https://www.googleapis.com/auth/chat.memberships",
  // Drive — full access covers drive.readonly and drive.file.
  "https://www.googleapis.com/auth/drive",
  // Gmail — modify covers read+label, compose covers drafts. Together they
  // satisfy every gmail_* tool we proxy. (mail.google.com/ is broader still
  // but is a "restricted" scope requiring extra Google verification.)
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.compose",
  // People — three orthogonal scopes for directory, contacts, self profile.
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/directory.readonly",
  "https://www.googleapis.com/auth/userinfo.profile",
];
