/**
 * Central export point for all Google BigQuery tools
 *
 * This file aggregates all tools from different modules into a single
 * export, making it easy to import all tools in main.ts.
 *
 * Tools:
 * - bigquery_query: Execute SQL queries
 * - bigquery_get_dataset: Get dataset details
 * - bigquery_list_datasets: List datasets in a project
 * - bigquery_list_tables: List tables in a dataset
 * - bigquery_get_table_schema: Get table schema details
 * - bigquery_list_jobs: List jobs in a project
 * - bigquery_get_job: Get job details and status
 * - bigquery_list_projects: List accessible projects
 */

import { bigqueryTools } from "./bigquery.ts";
import { jobsTools } from "./jobs.ts";
import { projectsTools } from "./projects.ts";

// Export all tools from all modules
export const tools = [
  // BigQuery tools
  ...bigqueryTools,
  // Jobs tools
  ...jobsTools,
  // Projects tools
  ...projectsTools,
];
