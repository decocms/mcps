/**
 * BigQuery API Constants
 */

export const BIGQUERY_API_BASE = "https://bigquery.googleapis.com/bigquery/v2";

/**
 * BigQuery API Endpoints
 */
export const ENDPOINTS = {
  // Datasets
  DATASETS: (projectId: string) =>
    `${BIGQUERY_API_BASE}/projects/${encodeURIComponent(projectId)}/datasets`,
  DATASET: (projectId: string, datasetId: string) =>
    `${BIGQUERY_API_BASE}/projects/${encodeURIComponent(projectId)}/datasets/${encodeURIComponent(datasetId)}`,

  // Tables
  TABLES: (projectId: string, datasetId: string) =>
    `${BIGQUERY_API_BASE}/projects/${encodeURIComponent(projectId)}/datasets/${encodeURIComponent(datasetId)}/tables`,
  TABLE: (projectId: string, datasetId: string, tableId: string) =>
    `${BIGQUERY_API_BASE}/projects/${encodeURIComponent(projectId)}/datasets/${encodeURIComponent(datasetId)}/tables/${encodeURIComponent(tableId)}`,

  // Query
  QUERY: (projectId: string) =>
    `${BIGQUERY_API_BASE}/projects/${encodeURIComponent(projectId)}/queries`,
  QUERY_RESULTS: (projectId: string, jobId: string) =>
    `${BIGQUERY_API_BASE}/projects/${encodeURIComponent(projectId)}/queries/${encodeURIComponent(jobId)}`,

  // Jobs
  JOBS: (projectId: string) =>
    `${BIGQUERY_API_BASE}/projects/${encodeURIComponent(projectId)}/jobs`,
  JOB: (projectId: string, jobId: string) =>
    `${BIGQUERY_API_BASE}/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}`,

  // Projects
  PROJECTS: `${BIGQUERY_API_BASE}/projects`,
} as const;

/**
 * Default configuration values
 */
export const DEFAULTS = {
  MAX_RESULTS: 1000,
  QUERY_TIMEOUT_MS: 60000,
  USE_LEGACY_SQL: false,
  USE_QUERY_CACHE: true,
} as const;

// Google OAuth scopes
export const GOOGLE_SCOPES = {
  BIGQUERY: "https://www.googleapis.com/auth/bigquery",
  BIGQUERY_READONLY: "https://www.googleapis.com/auth/bigquery.readonly",
  // Required for listing projects (Cloud Resource Manager API)
  CLOUD_PLATFORM_READ_ONLY:
    "https://www.googleapis.com/auth/cloud-platform.read-only",
} as const;
