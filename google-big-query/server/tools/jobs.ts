/**
 * BigQuery Jobs Tools
 *
 * Tools for listing and getting job information
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { BigQueryClient, getAccessToken } from "../lib/bigquery-client.ts";

// ============================================================================
// Schema Definitions
// ============================================================================

const JobReferenceSchema = z.object({
  projectId: z.string().describe("Project ID"),
  jobId: z.string().describe("Job ID"),
  location: z.string().optional().describe("Job location"),
});

const ErrorSchema = z.object({
  reason: z.string().optional().describe("Error reason"),
  location: z.string().optional().describe("Error location"),
  message: z.string().optional().describe("Error message"),
});

const JobStatusSchema = z.object({
  state: z.string().optional().describe("Job state (PENDING, RUNNING, DONE)"),
  errorResult: ErrorSchema.optional().describe("Final error if job failed"),
  errors: z.array(ErrorSchema).optional().describe("All errors encountered"),
});

const JobStatisticsSchema = z.object({
  creationTime: z.string().optional().describe("Job creation timestamp"),
  startTime: z.string().optional().describe("Job start timestamp"),
  endTime: z.string().optional().describe("Job end timestamp"),
  totalBytesProcessed: z.string().optional().describe("Total bytes processed"),
});

const JobSchema = z.object({
  id: z.string().optional().describe("Full job ID"),
  jobReference: JobReferenceSchema.optional().describe("Job reference"),
  state: z.string().optional().describe("Job state"),
  status: JobStatusSchema.optional().describe("Job status"),
  statistics: JobStatisticsSchema.optional().describe("Job statistics"),
});

// ============================================================================
// List Jobs Tool
// ============================================================================

export const createListJobsTool = (env: Env) =>
  createPrivateTool({
    id: "bigquery_list_jobs",
    description:
      "List BigQuery jobs in a project. Returns information about query jobs and their status. Useful for monitoring queries, checking job history, and debugging.",
    inputSchema: z.object({
      projectId: z.string().describe("Google Cloud project ID"),
      maxResults: z.coerce
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe("Maximum number of jobs to return (default: 100)"),
      pageToken: z
        .string()
        .optional()
        .describe("Token for fetching next page of results"),
      allUsers: z
        .boolean()
        .optional()
        .describe("Whether to list jobs from all users (default: false)"),
      stateFilter: z
        .array(z.enum(["pending", "running", "done"]))
        .optional()
        .describe("Filter jobs by state"),
      projection: z
        .enum(["full", "minimal"])
        .optional()
        .describe("Level of detail to return (default: full)"),
    }),
    outputSchema: z.object({
      jobs: z.array(JobSchema).describe("List of jobs"),
      nextPageToken: z
        .string()
        .optional()
        .describe("Token for fetching next page"),
    }),
    execute: async ({ context }) => {
      const client = new BigQueryClient({
        accessToken: getAccessToken(env),
      });

      const response = await client.listJobs(context.projectId, {
        maxResults: context.maxResults,
        pageToken: context.pageToken,
        allUsers: context.allUsers,
        stateFilter: context.stateFilter,
        projection: context.projection,
      });

      const jobs = (response.jobs || []).map((job) => ({
        id: job.id,
        jobReference: job.jobReference,
        state: job.state,
        status: job.status,
        statistics: job.statistics,
      }));

      return {
        jobs,
        nextPageToken: response.nextPageToken,
      };
    },
  });

// ============================================================================
// Get Job Tool
// ============================================================================

export const createGetJobTool = (env: Env) =>
  createPrivateTool({
    id: "bigquery_get_job",
    description:
      "Get detailed information about a specific BigQuery job. Returns job status, configuration, statistics, and error information if any. Useful for monitoring query execution and debugging failures.",
    inputSchema: z.object({
      projectId: z.string().describe("Google Cloud project ID"),
      jobId: z.string().describe("Job ID to retrieve"),
      location: z
        .string()
        .optional()
        .describe("Job location (e.g., 'US', 'EU')"),
    }),
    outputSchema: z.object({
      id: z.string().optional().describe("Full job ID"),
      jobReference: JobReferenceSchema.optional().describe("Job reference"),
      status: JobStatusSchema.optional().describe("Job status"),
      statistics: JobStatisticsSchema.optional().describe("Job statistics"),
      configuration: z
        .object({
          jobType: z.string().optional().describe("Job type"),
          query: z
            .object({
              query: z.string().describe("SQL query text"),
              useLegacySql: z.boolean().optional(),
            })
            .optional()
            .describe("Query configuration"),
        })
        .optional()
        .describe("Job configuration"),
    }),
    execute: async ({ context }) => {
      const client = new BigQueryClient({
        accessToken: getAccessToken(env),
      });

      const job = await client.getJob(context.projectId, context.jobId, {
        location: context.location,
      });

      return {
        id: job.id,
        jobReference: job.jobReference,
        status: job.status,
        statistics: job.statistics,
        configuration: job.configuration,
      };
    },
  });

// ============================================================================
// Export all Jobs tools
// ============================================================================

export const jobsTools = [createListJobsTool, createGetJobTool];
