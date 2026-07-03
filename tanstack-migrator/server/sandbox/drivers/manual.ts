/**
 * Manual driver — full simulation. No external calls at all; every task
 * "succeeds" after a short delay so the queue, state machine and dashboard
 * can be demoed end-to-end. Parity scores follow a deterministic ramp
 * (62 → +11 per iteration) so the UI shows a believable progression.
 */

import { SIMULATION_STEP_MS } from "../../constants.ts";
import type { SiteRow } from "../../db/types.ts";
import type { WorkerCtx } from "../../lib/mesh.ts";
import type {
  SandboxDriver,
  SandboxInfo,
  SandboxTaskInput,
  SandboxTaskResult,
} from "../client.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function simulatedParityScore(iteration: number): number {
  return Math.min(100, 62 + iteration * 11);
}

export const manualDriver: SandboxDriver = {
  name: "manual",

  async ensure(site: SiteRow): Promise<SandboxInfo> {
    await sleep(SIMULATION_STEP_MS);
    return {
      handle: `manual:${site.id}`,
      previewUrl: `https://sandbox-simulado.local/${site.name}`,
    };
  },

  async runTask(
    site: SiteRow,
    _ctx: WorkerCtx,
    task: SandboxTaskInput,
  ): Promise<SandboxTaskResult> {
    await sleep(SIMULATION_STEP_MS);
    if (task.kind === "migrate") {
      return {
        ok: true,
        output: `[simulation] migrate script ran for ${site.source_repo}; build green; initial push done`,
      };
    }
    const iteration = task.iteration ?? site.iterations_done;
    const score = simulatedParityScore(iteration + 1);
    return {
      ok: true,
      output: `[simulation] parity iteration ${iteration + 1} → score ${score}`,
      parityScore: score,
    };
  },

  async keepalive(): Promise<void> {
    // nothing to keep alive
  },

  async destroy(): Promise<void> {
    // nothing to destroy
  },
};
