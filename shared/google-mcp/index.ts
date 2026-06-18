/**
 * Helpers for wrapping Google's official MCP servers (which speak JSON-RPC
 * but don't support Dynamic Client Registration). A wrapper MCP holds the
 * Google OAuth client ID/secret server-side, runs the standard PKCE flow via
 * `createGoogleOAuth`, and proxies `tools/call` to the upstream endpoint.
 *
 * Used by `google-workspace` (Calendar/Chat/Drive/Gmail/People) and the
 * `google-*-official` single-service wrappers.
 */

export { proxyMcpCall } from "./proxy.ts";
export { jsonSchemaToZod } from "./json-schema-to-zod.ts";
export {
  wrapBackendTool,
  wrapBackendSnapshot,
  type BackendToolDefinition,
  type WrapToolOptions,
} from "./wrap-tool.ts";
export {
  generateSnapshots,
  type BackendDescriptor,
  type GenerateSnapshotsOptions,
} from "./generate-snapshot.ts";
