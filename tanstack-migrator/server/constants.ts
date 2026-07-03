export const DASHBOARD_RESOURCE_URI = "ui://tanstack-migrator/dashboard";

/** Worker cadence + safety rails. */
export const TICK_INTERVAL_MS = 30_000;
export const LEASE_TTL_MS = 2 * 60_000;
/** No progress for this long while active → mark failed, release the slot. */
export const WATCHDOG_STALL_MS = 30 * 60_000;

/** Simulated phase duration used by the manual (simulation) sandbox driver. */
export const SIMULATION_STEP_MS = 5_000;

export const DEFAULT_GITHUB_ORG = "deco-sites";
export const DEFAULT_CF_ACCOUNT_ID = "c95fc4cec7fc52453228d9db170c372c";

export const DEFAULT_PARITY_TARGET = 95;
export const DEFAULT_MAX_ITERATIONS = 8;
export const DEFAULT_NO_IMPROVE_LIMIT = 3;
export const DEFAULT_MAX_CONCURRENT = 1;

/** Object-storage key prefix for parity artifacts. */
export const ARTIFACT_ROOT = "tanstack-migrator";
