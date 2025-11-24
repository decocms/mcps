// Apify API types based on official v2 documentation
export interface ActorRun {
  id: string;
  // deno-lint-ignore no-explicit-any
  data?: any;
  actId: string;
  userId: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  buildId?: string;
  exitCode?: number;
  defaultDatasetId?: string;
  defaultKeyValueStoreId?: string;
  defaultRequestQueueId?: string;
  buildNumber?: string;
  isContainerServerReady?: boolean;
  gitBranchName?: string;
  usage?: {
    ACTOR_COMPUTE_UNITS?: number;
    DATASET_READS?: number;
    DATASET_WRITES?: number;
    KEY_VALUE_STORE_READS?: number;
    KEY_VALUE_STORE_WRITES?: number;
    REQUEST_QUEUE_READS?: number;
    REQUEST_QUEUE_WRITES?: number;
    DATA_TRANSFER_INTERNAL_GBYTES?: number;
    DATA_TRANSFER_EXTERNAL_GBYTES?: number;
    PROXY_RESIDENTIAL_TRANSFER_GBYTES?: number;
    PROXY_SERPS?: number;
  };
  usageTotalUsd?: number;
  usageUsd?: {
    ACTOR_COMPUTE_UNITS?: number;
    DATASET_READS?: number;
    DATASET_WRITES?: number;
    KEY_VALUE_STORE_READS?: number;
    KEY_VALUE_STORE_WRITES?: number;
    REQUEST_QUEUE_READS?: number;
    REQUEST_QUEUE_WRITES?: number;
    DATA_TRANSFER_INTERNAL_GBYTES?: number;
    DATA_TRANSFER_EXTERNAL_GBYTES?: number;
    PROXY_RESIDENTIAL_TRANSFER_GBYTES?: number;
    PROXY_SERPS?: number;
  };
}

// Enhanced ActorRun response that may include dataset results
export interface ActorRunResponse {
  data: ActorRun & {
    // Dataset items included when includeDatasetItems is true
    results?: Array<Record<string, unknown>>;
  };
}

export interface Actor {
  id: string;
  userId: string;
  name: string;
  username: string;
  description?: string;
  readme?: string;
  isPublic: boolean;
  createdAt: string;
  modifiedAt: string;
  restartOnError: boolean;
  isDeprecated: boolean;
  isAnonymouslyRunnable: boolean;
  categories: string[];
  defaultRunOptions?: {
    build: string;
    timeoutSecs: number;
    memoryMbytes: number;
  };
  exampleRunInput?: Record<string, unknown>;
  stats: {
    totalRuns: number;
    totalUsers?: number;
    totalUsers7Days?: number;
    totalUsers30Days?: number;
    totalUsers90Days?: number;
    totalMetamorphs?: number;
    lastRunStartedAt?: string;
  };
}

export interface ActorsResponse {
  data: {
    total: number;
    count: number;
    offset: number;
    limit: number;
    desc: boolean;
    items: Actor[];
  };
}

export interface ActorRunsResponse {
  data: {
    total: number;
    count: number;
    offset: number;
    limit: number;
    desc: boolean;
    items: ActorRun[];
  };
}

export interface Dataset {
  id: string;
  name?: string;
  userId: string;
  createdAt: string;
  modifiedAt: string;
  accessedAt: string;
  itemCount: number;
  cleanItemCount: number;
  actId?: string;
  actRunId?: string;
}

export interface KeyValueStore {
  id: string;
  name?: string;
  userId: string;
  createdAt: string;
  modifiedAt: string;
  accessedAt: string;
  actId?: string;
  actRunId?: string;
}

// Dataset Items API types
export type DatasetItemFormat =
  | "json"
  | "jsonl"
  | "xml"
  | "html"
  | "csv"
  | "xlsx"
  | "rss";

export interface DatasetItemsQueryParams {
  /** Response format - determines how data is structured and returned */
  format?: DatasetItemFormat;
  /** Skip hidden fields (starting with #) from output */
  skipHidden?: boolean | 0 | 1;
  /** Clean output by omitting hidden fields (alias for skipHidden) */
  clean?: boolean | 0 | 1;
  /** Unwind array fields to separate items */
  unwind?: string;
  /** Flatten nested objects using dot notation */
  flatten?: string[];
  /** Select only specific fields */
  fields?: string[];
  /** Omit specific fields */
  omit?: string[];
  /** Return results in descending order (newest first) */
  desc?: boolean | 0 | 1;
  /** Pagination offset */
  offset?: number;
  /** Maximum number of items to return */
  limit?: number;
  /** Custom XML root element name (for XML/RSS formats) */
  xmlRoot?: string;
  /** Custom XML row element name (for XML/RSS formats) */
  xmlRow?: string;
  /** Skip empty items */
  skipEmpty?: boolean | 0 | 1;
  /** Simplified format for easier processing */
  simplified?: boolean | 0 | 1;
}

// ============================================================================
// Zod Input/Output Schemas for Tool Validation
// ============================================================================

import { z } from "zod";

/**
 * List Actors Tool - Input Schema
 * Validates pagination and filtering parameters
 */
export const listActorsInputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .optional()
    .describe("Maximum number of actors to return (default: 10)"),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Number of actors to skip (default: 0)"),
  my: z
    .boolean()
    .optional()
    .describe("If true, only return actors owned by the user"),
  desc: z
    .boolean()
    .optional()
    .describe("If true, sort results in descending order by creation date"),
});

/**
 * Get Actor Tool - Input Schema
 * Validates actor identifier
 */
export const getActorInputSchema = z.object({
  actorId: z.string().describe("The ID or name of the actor"),
});

/**
 * List Actor Runs Tool - Input Schema
 * Validates actor runs pagination and filtering
 */
export const listActorRunsInputSchema = z.object({
  actorId: z.string().describe("The ID of the actor"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe("Maximum number of runs to return (default: 10)"),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Number of runs to skip (default: 0)"),
  status: z
    .string()
    .optional()
    .describe(
      "Filter runs by status (READY, RUNNING, SUCCEEDED, FAILED, etc.)",
    ),
  desc: z
    .boolean()
    .optional()
    .describe("If true, sort results in descending order by creation date"),
});

/**
 * Get Actor Run Tool - Input Schema
 * Validates actor run identifier and options
 */
export const getActorRunInputSchema = z.object({
  actorId: z.string().describe("The ID of the actor"),
  runId: z.string().describe("The ID of the actor run"),
  includeDatasetItems: z
    .boolean()
    .optional()
    .describe("If true, include dataset items in the response"),
});

/**
 * Run Actor Tools - Input Schema
 * Validates parameters for both sync and async execution
 */
export const runActorInputSchema = z.object({
  actorId: z.string().describe("The ID of the actor to run"),
  input: z
    .string()
    .describe("Input data for the actor run (Stringified JSON object)"),
  timeout: z
    .number()
    .int()
    .optional()
    .describe("Maximum timeout for the run in seconds"),
  memory: z
    .number()
    .int()
    .optional()
    .describe("Amount of memory allocated for the run in megabytes"),
  build: z
    .string()
    .optional()
    .describe("Specific build version to use (optional)"),
});

/**
 * Run Actor Sync Tool - Output Schema
 * Validates synchronous execution response with dataset items
 */
export const runActorSyncOutputSchema = z.object({
  data: z.unknown().describe("Dataset items from the actor run"),
});

/**
 * Run Actor Async Tool - Output Schema
 * Validates asynchronous execution response with run metadata
 */
export const runActorAsyncOutputSchema = z
  .object({
    id: z.string().describe("Run ID"),
    status: z.string().describe("Current status of the run"),
    actorId: z.string().describe("Actor ID"),
  })
  .passthrough();
