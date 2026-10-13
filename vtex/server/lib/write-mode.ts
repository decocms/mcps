/**
 * Write-mode gate.
 *
 * The VTEX MCP is READ-ONLY by default. Write operations (create/update/delete)
 * only run when the connection opts in via `writeMode: true` in the
 * configuration state (or the `VTEX_WRITE_MODE=true` env var for local dev).
 *
 * Enforced per-request at execute time — NOT by filtering the tool list.
 * @decocms/runtime resolves and caches tool registrations once for the process
 * lifetime, while configuration state is delivered per-request (multi-tenant).
 * Reading `writeMode` at registration time would freeze whatever the first
 * request happened to send for every subsequent tenant — the same hazard the
 * comment in `tool-adapter.ts` describes for credentials. So the gate reads
 * state per-call, exactly like `resolveCredentials`.
 */
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

/**
 * Resolve whether write operations are allowed for the current request.
 *
 * Precedence: explicit `state.writeMode` (true/false) wins; when it is absent
 * we fall back to `VTEX_WRITE_MODE=true` (handy for local development); default
 * is read-only.
 */
export function resolveWriteMode(state: unknown): boolean {
  const fromState = (state as { writeMode?: unknown } | undefined)?.writeMode;
  if (fromState === true) return true;
  if (fromState === false) return false;
  return process.env.VTEX_WRITE_MODE === "true";
}

/**
 * A tool counts as a read operation ONLY when it is explicitly annotated with
 * `readOnlyHint: true`. Anything else — including tools with no annotations —
 * is treated as a write, so an un-annotated mutation can never slip through the
 * gate in read-only mode.
 */
export function isReadOnlyTool(annotations?: ToolAnnotations): boolean {
  return annotations?.readOnlyHint === true;
}

/**
 * Throw a clear, actionable error when a write tool is invoked while the MCP is
 * in read-only mode. No-op when write mode is enabled.
 */
export function assertWriteModeEnabled(state: unknown, toolId: string): void {
  if (resolveWriteMode(state)) return;
  throw new Error(
    `${toolId} is a write operation, but this VTEX MCP is running in read-only mode. ` +
      `Enable writes by setting "writeMode": true in the connection configuration ` +
      `(or VTEX_WRITE_MODE=true for local development).`,
  );
}
