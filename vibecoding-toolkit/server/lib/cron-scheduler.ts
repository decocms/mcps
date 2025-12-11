/**
 * pg_cron + pg_net scheduler for workflow execution processing.
 *
 * This module sets up a PostgreSQL cron job that periodically calls
 * an HTTP endpoint to process enqueued workflow executions.
 *
 * Requires pg_cron and pg_net extensions in PostgreSQL.
 */

import type { Env } from "../main.ts";

const CRON_JOB_NAME = "process-enqueued-workflows";

/**
 * Ensures the cron job exists to periodically call the workflow processing endpoint.
 *
 * Uses pg_cron to schedule and pg_net to make HTTP POST requests.
 * The cron runs every second by default.
 *
 * @param env - Environment with database access and MESH_REQUEST_CONTEXT for auth
 * @param endpointUrl - The URL to POST to (e.g., https://your-app.deco.site/api/process-workflows)
 * @param schedule - Cron schedule expression (default: every second)
 */
export async function ensureCronScheduler(
  env: Env,
  endpointUrl: string,
  schedule = "10 seconds", // pg_cron interval syntax: '[1-59] seconds' for sub-minute scheduling
): Promise<void> {
  // Extract auth token from the current request context
  // This token is needed for the cron HTTP request to authenticate
  const meshToken = env.MESH_REQUEST_CONTEXT?.token;

  if (!meshToken) {
    console.warn(
      "[CRON] No MESH_REQUEST_CONTEXT.token available - cron requests may fail to authenticate",
    );
  }

  const httpCommand = buildHttpCommand(endpointUrl, meshToken);

  // First, check if the job already exists
  const existingJob = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `SELECT jobid FROM cron.job WHERE jobname = ?`,
    params: [CRON_JOB_NAME],
  });

  const jobExists = (existingJob.result[0]?.results?.length ?? 0) > 0;

  if (jobExists) {
    // Update existing job
    await env.DATABASE.DATABASES_RUN_SQL({
      sql: `SELECT cron.alter_job(
        job_id := (SELECT jobid FROM cron.job WHERE jobname = ?),
        schedule := ?,
        command := ?
      )`,
      params: [CRON_JOB_NAME, schedule, httpCommand],
    });
    console.log(
      `[CRON] Updated cron job '${CRON_JOB_NAME}' with schedule: ${schedule}`,
    );
  } else {
    // Create new job
    await env.DATABASE.DATABASES_RUN_SQL({
      sql: `SELECT cron.schedule(?, ?, ?)`,
      params: [CRON_JOB_NAME, schedule, httpCommand],
    });
    console.log(
      `[CRON] Created cron job '${CRON_JOB_NAME}' with schedule: ${schedule}`,
    );
  }
}

/**
 * Builds the SQL command that uses pg_net to make an HTTP POST request.
 * Includes x-mesh-token header for authentication so the runtime can set up bindings.
 */
function buildHttpCommand(endpointUrl: string, meshToken?: string): string {
  // Build headers JSON - include x-mesh-token if available for multi-tenant auth
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (meshToken) {
    headers["x-mesh-token"] = meshToken;
  }

  // Escape any single quotes in the headers JSON for SQL
  const headersJson = JSON.stringify(headers).replace(/'/g, "''");

  return `SELECT net.http_post(
    url := '${endpointUrl}',
    headers := '${headersJson}'::jsonb,
    body := '{}'::jsonb
  )`;
}

/**
 * Removes the cron job if it exists.
 */
export async function removeCronScheduler(env: Env): Promise<void> {
  await env.DATABASE.DATABASES_RUN_SQL({
    sql: `SELECT cron.unschedule(?)`,
    params: [CRON_JOB_NAME],
  });
  console.log(`[CRON] Removed cron job '${CRON_JOB_NAME}'`);
}

/**
 * Gets the status of the cron job.
 */
export async function getCronJobStatus(env: Env): Promise<{
  exists: boolean;
  schedule?: string;
  lastRun?: string;
  nextRun?: string;
}> {
  const result = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `SELECT jobid, schedule, active FROM cron.job WHERE jobname = ?`,
    params: [CRON_JOB_NAME],
  });

  const job = result.result[0]?.results?.[0] as
    | {
        jobid: number;
        schedule: string;
        active: boolean;
      }
    | undefined;

  if (!job) {
    return { exists: false };
  }

  // Get last run details
  const runDetails = await env.DATABASE.DATABASES_RUN_SQL({
    sql: `SELECT start_time, end_time, status FROM cron.job_run_details 
          WHERE jobid = ? ORDER BY start_time DESC LIMIT 1`,
    params: [job.jobid],
  });

  const lastRun = runDetails.result[0]?.results?.[0] as
    | {
        start_time: string;
        end_time: string;
        status: string;
      }
    | undefined;

  return {
    exists: true,
    schedule: job.schedule,
    lastRun: lastRun?.end_time,
  };
}
