/**
 * SandboxClient — abstraction over "where the migration actually runs".
 *
 * Drivers:
 *   - manual:    end-to-end simulation (no external effects). Used for demos
 *                and to exercise the queue/UI without touching mesh.
 *   - decopilot: live mode. Lifecycle via mesh management tools
 *                (VM_START/VM_DELETE on /mcp/self) and execution via bounded
 *                decopilot sessions (claude-code provider) — the same path
 *                the agentic CMS uses.
 *
 * A future `daemon` driver (mesh PR exposing bash/read externally) can slot
 * in here without touching the engine.
 */

import type { SiteRow } from "../db/types.ts";
import type { WorkerCtx } from "../lib/mesh.ts";
import { decopilotDriver } from "./drivers/decopilot.ts";
import { manualDriver } from "./drivers/manual.ts";

export interface SandboxInfo {
  handle: string;
  previewUrl: string | null;
  virtualMcpId?: string;
}

export type SandboxTaskKind = "migrate" | "fix_iteration" | "parity";

export interface SandboxTaskInput {
  kind: SandboxTaskKind;
  prompt: string;
  /** Parity iteration number, for logging/artifacts. */
  iteration?: number;
  /** sitemig_runs row to stamp with the session threadId. */
  runId?: string;
  timeoutMs?: number;
}

export interface SandboxTaskResult {
  ok: boolean;
  /** Tail of the session output (stored in sitemig_runs.logs_tail). */
  output: string;
  /** Parity score parsed from the task output, when the task produces one. */
  parityScore?: number;
  error?: string;
}

export interface SandboxDriver {
  readonly name: "manual" | "decopilot";
  /**
   * Optional pre-step: create the driver's project entity (e.g. mesh
   * virtualMcp) so the phase can PERSIST its id before ensure() — a failed
   * ensure() then retries against the same project instead of duplicating.
   */
  prepareProject?(
    site: SiteRow,
    ctx: WorkerCtx,
  ): Promise<{ virtualMcpId: string }>;
  /** Idempotent: create the sandbox if needed, return handle + preview URL. */
  ensure(site: SiteRow, ctx: WorkerCtx): Promise<SandboxInfo>;
  /** Run one bounded task (migrate pass / parity+fix iteration). */
  runTask(
    site: SiteRow,
    ctx: WorkerCtx,
    task: SandboxTaskInput,
  ): Promise<SandboxTaskResult>;
  /** Reset the sandbox idle TTL (mesh reaps after ~15min idle). */
  keepalive(site: SiteRow, ctx: WorkerCtx): Promise<void>;
  destroy(site: SiteRow, ctx: WorkerCtx): Promise<void>;
}

export function getDriver(ctx: WorkerCtx): SandboxDriver {
  return ctx.config.sandboxProvider === "decopilot"
    ? decopilotDriver
    : manualDriver;
}

export function isSimulation(ctx: WorkerCtx): boolean {
  return ctx.config.sandboxProvider === "manual";
}
