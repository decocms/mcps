/** status → phase handler map. Every handler is idempotent per-tick. */

import type { SiteRow, SiteStatus } from "../db/types.ts";
import type { WorkerCtx } from "../lib/mesh.ts";
import type { InflightTracker } from "./inflight.ts";
import { awaitingMerge } from "./phases/awaiting-merge.ts";
import { baselining } from "./phases/baselining.ts";
import { creatingRepo } from "./phases/creating-repo.ts";
import { deployingCf } from "./phases/deploying-cf.ts";
import { fixing } from "./phases/fixing.ts";
import { merging } from "./phases/merging.ts";
import { migratingScript } from "./phases/migrating-script.ts";
import { openingPr } from "./phases/opening-pr.ts";
import { paritying } from "./phases/paritying.ts";
import { provisioningSandbox } from "./phases/provisioning-sandbox.ts";
import { reviewing } from "./phases/reviewing.ts";
import { triaging } from "./phases/triaging.ts";

export interface EngineDeps {
  inflight: InflightTracker;
}

export type PhaseHandler = (
  site: SiteRow,
  ctx: WorkerCtx,
  deps: EngineDeps,
) => Promise<void>;

/**
 * Legacy statuses (≤ v0.4.x) have no handlers on purpose: the worker sweep
 * translates them via toCurrentStatus before advancing; an untranslated
 * leftover just skips one tick.
 */
export const PHASE_HANDLERS: Partial<Record<SiteStatus, PhaseHandler>> = {
  creating_repo: creatingRepo,
  provisioning_sandbox: provisioningSandbox,
  baselining,
  migrating_script: migratingScript,
  opening_pr: openingPr,
  reviewing,
  merging,
  triaging,
  fixing,
  paritying,
  deploying: deployingCf,
  awaiting_merge: awaitingMerge,
};
