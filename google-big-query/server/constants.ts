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
    `${BIGQUERY_API_BASE}/projects/${projectId}/datasets`,
  DATASET: (projectId: string, datasetId: string) =>
    `${BIGQUERY_API_BASE}/projects/${projectId}/datasets/${datasetId}`,

  // Tables
  TABLES: (projectId: string, datasetId: string) =>
    `${BIGQUERY_API_BASE}/projects/${projectId}/datasets/${datasetId}/tables`,
  TABLE: (projectId: string, datasetId: string, tableId: string) =>
    `${BIGQUERY_API_BASE}/projects/${projectId}/datasets/${datasetId}/tables/${tableId}`,

  // Query
  QUERY: (projectId: string) =>
    `${BIGQUERY_API_BASE}/projects/${projectId}/queries`,
  QUERY_RESULTS: (projectId: string, jobId: string) =>
    `${BIGQUERY_API_BASE}/projects/${projectId}/queries/${jobId}`,

  // Jobs
  JOBS: (projectId: string) =>
    `${BIGQUERY_API_BASE}/projects/${projectId}/jobs`,
  JOB: (projectId: string, jobId: string) =>
    `${BIGQUERY_API_BASE}/projects/${projectId}/jobs/${jobId}`,

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
} as const;
