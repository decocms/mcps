/** status → phase handler map. Every handler is idempotent per-tick. */

import type { SiteRow, SiteStatus } from "../db/types.ts";
import type { WorkerCtx } from "../lib/mesh.ts";
import type { InflightTracker } from "./inflight.ts";
import { creatingRepo } from "./phases/creating-repo.ts";
import { deployingCf } from "./phases/deploying-cf.ts";
import { installingSync } from "./phases/installing-sync.ts";
import { migrating } from "./phases/migrating.ts";
import { provisioningSandbox } from "./phases/provisioning-sandbox.ts";
import { validating } from "./phases/validating.ts";

export interface EngineDeps {
  inflight: InflightTracker;
}

export type PhaseHandler = (
  site: SiteRow,
  ctx: WorkerCtx,
  deps: EngineDeps,
) => Promise<void>;

export const PHASE_HANDLERS: Partial<Record<SiteStatus, PhaseHandler>> = {
  creating_repo: creatingRepo,
  provisioning_sandbox: provisioningSandbox,
  // v2 = zombie-invisible session phases (see db/types.ts toV2Status)
  migrating,
  migrating2: migrating,
  migrating3: migrating,
  installing_sync: installingSync,
  validating,
  validating2: validating,
  validating3: validating,
  deploying_cf: deployingCf,
};
