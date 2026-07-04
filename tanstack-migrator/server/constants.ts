export const DASHBOARD_RESOURCE_URI = "ui://tanstack-migrator/dashboard";

/** Worker cadence + safety rails. */
export const TICK_INTERVAL_MS = 30_000;
export const LEASE_TTL_MS = 2 * 60_000;
/** No progress for this long while active → mark failed, release the slot. */
export const WATCHDOG_STALL_MS = 30 * 60_000;
/**
 * In-flight session with no heartbeat for this long → probe the thread on
 * the mesh (reader dead? mesh dead?) instead of waiting for the watchdog.
 */
export const LIVENESS_STALL_MS = 4 * 60_000;

/** Session timeouts per task kind (the reader gives up past these). */
export const SESSION_TIMEOUT_MS: Record<string, number> = {
  migrate: 30 * 60_000,
  triage: 20 * 60_000,
  fix: 25 * 60_000,
  parity: 20 * 60_000,
};

/** Simulated phase duration used by the manual (simulation) sandbox driver. */
export const SIMULATION_STEP_MS = 5_000;

export const DEFAULT_GITHUB_ORG = "deco-sites";
export const DEFAULT_CF_ACCOUNT_ID = "c95fc4cec7fc52453228d9db170c372c";

export const DEFAULT_PARITY_TARGET = 95;
export const DEFAULT_MAX_ITERATIONS = 8;
export const DEFAULT_NO_IMPROVE_LIMIT = 3;
export const DEFAULT_MAX_CONCURRENT = 1;
export const DEFAULT_MAX_FIX_SESSIONS = 20;
export const DEFAULT_FIX_BATCH_SIZE = 3;
export const DEFAULT_MAX_ISSUES_PER_TRIAGE = 15;
export const DEFAULT_WORK_BRANCH = "migration/tanstack";

/** Object-storage key prefix for parity artifacts. */
export const ARTIFACT_ROOT = "tanstack-migrator";
