/**
 * Shared Zod schemas and types for Replicate tools
 */

import { z } from "zod";

/**
 * Model identifier schema
 * Format: 'owner/name' or 'owner/name:version'
 */
export const ModelIdentifierSchema = z
  .string()
  .describe(
    "Model identifier in format 'owner/name' or 'owner/name:version'. " +
      "Examples: 'stability-ai/sdxl', 'meta/llama-2-70b-chat'",
  );

/**
 * Simple model identifier schema (without version)
 * Format: 'owner/name'
 */
export const SimpleModelIdentifierSchema = z
  .string()
  .describe(
    "Model identifier in format 'owner/name'. " +
      "Examples: 'stability-ai/sdxl', 'meta/llama-2-70b-chat'",
  );

/**
 * Prediction ID schema
 */
export const PredictionIdSchema = z
  .string()
  .describe("The unique ID of the prediction");

/**
 * Model input parameters schema
 */
export const ModelInputSchema = z
  .record(z.unknown())
  .describe(
    "Input parameters for the model as key-value pairs. " +
      "Check model documentation for required/optional parameters.",
  );

/**
 * Prediction status schema (all possible statuses from Replicate API)
 */
export const PredictionStatusSchema = z
  .string()
  .describe("Current status of the prediction");

/**
 * Legacy status enum (for tools that need stricter validation)
 */
export const StrictPredictionStatusSchema = z
  .enum(["starting", "processing", "succeeded", "failed", "canceled"])
  .describe("Current status of the prediction");

/**
 * Metrics schema for predictions
 */
export const MetricsSchema = z
  .object({
    predict_time: z.number().optional().describe("Prediction execution time"),
  })
  .optional()
  .describe("Performance metrics");

/**
 * URLs schema for prediction operations
 */
export const PredictionUrlsSchema = z
  .object({
    get: z.string().describe("URL to get prediction status"),
    cancel: z.string().describe("URL to cancel the prediction"),
  })
  .optional()
  .describe("URLs to get status or cancel the prediction");

/**
 * Model version schema
 */
export const ModelVersionSchema = z
  .object({
    id: z.string().describe("Version ID"),
    created_at: z.string().describe("Version creation date"),
    cog_version: z.string().describe("Cog version used"),
    openapi_schema: z
      .record(z.unknown())
      .describe("OpenAPI schema for the model"),
  })
  .optional()
  .describe("Latest version information with full schema");

/**
 * Model example schema
 */
export const ModelExampleSchema = z
  .object({
    input: z.record(z.unknown()).describe("Example input parameters"),
    output: z.unknown().optional().describe("Example output"),
  })
  .optional()
  .describe("Default example input/output");

/**
 * Base prediction output schema (common fields)
 */
export const BasePredictionOutputSchema = {
  id: z.string().describe("Unique prediction ID"),
  status: PredictionStatusSchema,
  model: z.string().describe("Model used for the prediction"),
  output: z.unknown().optional().describe("Model output (if completed)"),
  error: z.string().optional().describe("Error message (if failed)"),
  logs: z.string().optional().describe("Execution logs"),
  metrics: MetricsSchema,
  urls: PredictionUrlsSchema,
};

/**
 * Complete prediction output schema with timestamps
 */
export const CompletePredictionOutputSchema = {
  ...BasePredictionOutputSchema,
  version: z.string().describe("Model version used"),
  input: ModelInputSchema.describe("Input parameters used"),
  created_at: z.string().describe("When the prediction was created"),
  started_at: z.string().optional().describe("When processing started"),
  completed_at: z.string().optional().describe("When the prediction completed"),
};

/**
 * Simplified model version schema (for list operations)
 */
export const SimpleModelVersionSchema = z
  .object({
    id: z.string().describe("Version ID"),
    created_at: z.string().describe("Version creation date"),
  })
  .optional()
  .describe("Latest version information");

/**
 * Model info schema (base fields common to all model representations)
 */
export const BaseModelInfoSchema = {
  owner: z.string().describe("Model owner username"),
  name: z.string().describe("Model name"),
  description: z.string().optional().describe("Model description"),
  visibility: z.string().describe("Model visibility (public/private)"),
  run_count: z.number().describe("Number of times model has been run"),
  cover_image_url: z.string().optional().describe("URL of model cover image"),
  url: z.string().describe("Full model URL"),
};

/**
 * Model summary schema (for list operations)
 */
export const ModelSummarySchema = z.object({
  ...BaseModelInfoSchema,
  latest_version: SimpleModelVersionSchema,
});

/**
 * Complete model details schema (for get operations)
 */
export const CompleteModelDetailsSchema = z.object({
  ...BaseModelInfoSchema,
  github_url: z.string().optional().describe("GitHub repository URL"),
  paper_url: z.string().optional().describe("Research paper URL"),
  license_url: z.string().optional().describe("License URL"),
  latest_version: ModelVersionSchema,
  default_example: ModelExampleSchema,
});

/**
 * List models output schema
 */
export const ListModelsOutputSchema = z.object({
  models: z.array(ModelSummarySchema),
  next_cursor: z
    .string()
    .optional()
    .describe("Cursor for next page of results"),
});

/**
 * Cancel prediction output schema
 */
export const CancelPredictionOutputSchema = z.object({
  id: z.string().describe("Unique prediction ID"),
  status: PredictionStatusSchema.describe(
    "Current status of the prediction (should be 'canceled')",
  ),
  message: z.string().describe("Confirmation message"),
});

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/**
 * Run model input schema
 */
export const RunModelInputSchema = z.object({
  model: ModelIdentifierSchema,
  input: ModelInputSchema,
  wait: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Whether to wait for the prediction to complete. " +
        "If false, returns immediately with prediction ID.",
    ),
  webhook: z
    .string()
    .url()
    .optional()
    .describe(
      "Optional webhook URL to receive prediction updates. " +
        "Replicate will POST to this URL when prediction completes.",
    ),
});

/**
 * Get prediction input schema
 */
export const GetPredictionInputSchema = z.object({
  predictionId: PredictionIdSchema.describe(
    "The unique ID of the prediction to retrieve",
  ),
});

/**
 * Cancel prediction input schema
 */
export const CancelPredictionInputSchema = z.object({
  predictionId: PredictionIdSchema.describe(
    "The unique ID of the prediction to cancel",
  ),
});

/**
 * Get model input schema
 */
export const GetModelInputSchema = z.object({
  model: SimpleModelIdentifierSchema,
});

/**
 * List models input schema
 */
export const ListModelsInputSchema = z.object({
  owner: z
    .string()
    .optional()
    .describe(
      "Filter models by owner username or organization. " +
        "Examples: 'stability-ai', 'meta', 'replicate'. " +
        "Leave empty to see featured models.",
    ),
  cursor: z
    .string()
    .optional()
    .describe("Pagination cursor from previous response"),
});
