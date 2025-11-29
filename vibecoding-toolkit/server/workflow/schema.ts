/**
 * Workflow Schema
 *
 * Implements the phase-based workflow model with:
 * - Unified step schema (tool, transform, sleep)
 * - Phase-based parallelism
 * - ForEach loop modifier
 * - Trigger support for workflow chaining
 *
 * @see docs/WORKFLOW_SCHEMA_DESIGN.md
 */

import z from "zod";

// ============================================================================
// Step Schema
// ============================================================================

/**
 * Step Schema - Unified schema for all step types
 *
 * Step types:
 * - tool: Call external service via MCP (non-deterministic, checkpointed)
 * - transform: Pure TypeScript data transformation (deterministic, replayable)
 * - sleep: Wait for time
 */
export const StepSchema = z.object({
  name: z.string().min(1).describe("Unique step name within workflow"),

  // === WHAT TO DO (pick one) ===

  /**
   * Call an external tool (non-deterministic, checkpointed)
   */
  tool: z
    .object({
      connectionId: z.string().describe("Integration connection ID"),
      toolName: z.string().describe("Name of the tool to call"),
    })
    .optional()
    .describe("Call an external MCP tool"),

  /**
   * Pure TypeScript transformation (deterministic, replayable)
   *
   * Must declare Input and Output interfaces for validation.
   * Transpiled to JS before execution in QuickJS sandbox.
   *
   * Receives: input object (with resolved @refs)
   * Returns: JSON-serializable value matching Output interface
   *
   * FORBIDDEN: fetch, Date, Math.random, crypto, setTimeout, ctx, imports
   * ALLOWED: string ops, array methods, object mapping, math (non-random)
   */
  transform: z
    .string()
    .optional()
    .describe(
      "TypeScript code for pure data transformation. Must export default function and declare Input/Output interfaces.",
    ),

  /**
   * Sleep/wait until time passes
   */
  sleep: z
    .object({
      ms: z.number().optional().describe("Milliseconds to sleep"),
      until: z
        .string()
        .optional()
        .describe("ISO date string or @ref to sleep until"),
    })
    .optional()
    .describe("Wait for specified time or until a specific date"),

  // === INPUT ===

  /**
   * Input object with @ref resolution
   * @refs: @stepName.output.path, @input.path, @item, @index
   */
  input: z
    .record(z.unknown())
    .optional()
    .describe("Input object with @ref resolution"),

  // === MODIFIERS ===

  /**
   * Loop: repeat step for each item in referenced array
   */
  forEach: z
    .string()
    .optional()
    .describe("@ref to array - repeat step for each item"),

  /**
   * Variable name for current item in forEach loop
   */
  as: z
    .string()
    .default("item")
    .describe("Variable name for current loop item"),

  /**
   * Safety limit for forEach iterations
   */
  maxIterations: z.number().default(100).describe("Maximum forEach iterations"),

  // === RETRY (tool steps only) ===

  retry: z
    .object({
      maxAttempts: z.number().default(3).describe("Maximum retry attempts"),
      backoffMs: z
        .number()
        .default(1000)
        .describe("Initial backoff in milliseconds"),
    })
    .optional()
    .describe("Retry configuration (tool steps only)"),
});

export type Step = z.infer<typeof StepSchema>;

// ============================================================================
// Trigger Schema
// ============================================================================

/**
 * Trigger Schema - Fire another workflow when execution completes
 */
export const TriggerSchema = z.object({
  /**
   * Target workflow ID to execute
   */
  workflowId: z.string().describe("Target workflow ID to trigger"),

  /**
   * Inputs for the new execution (uses @refs like step inputs)
   * Maps output data to workflow input fields.
   *
   * If any @ref doesn't resolve (property missing), this trigger is SKIPPED.
   */
  inputs: z
    .record(z.unknown())
    .describe("Input mapping with @refs from current workflow output"),

  /**
   * For array values: trigger one execution per item.
   * The @ref path to iterate over.
   * When set, @item and @index are available in inputs.
   */
  forEach: z
    .string()
    .optional()
    .describe("@ref to array - trigger one execution per item"),

  // === Execution config for triggered workflow ===

  workflow_timeout_ms: z
    .number()
    .optional()
    .describe("Timeout for triggered workflow"),
  max_retries: z
    .number()
    .optional()
    .describe("Max retries for triggered workflow"),
});

export type Trigger = z.infer<typeof TriggerSchema>;

// ============================================================================
// Workflow Schema
// ============================================================================

/**
 * Workflow Schema - Phase-based parallelism
 *
 * Steps organized into phases:
 * - Phases execute sequentially
 * - Steps within a phase execute in parallel
 */
export const WorkflowSchema = z.object({
  name: z.string().min(1).describe("Workflow name"),
  description: z.string().optional().describe("Workflow description"),

  /**
   * Steps organized into phases.
   * - Phases execute sequentially
   * - Steps within a phase execute in parallel
   */
  steps: z
    .array(z.array(StepSchema))
    .describe("2D array: phases (sequential) containing steps (parallel)"),

  /**
   * Triggers to fire when execution completes successfully
   */
  triggers: z
    .array(TriggerSchema)
    .optional()
    .describe("Workflows to trigger on completion"),

  /**
   * Computed schemas from transform steps (set at creation time)
   */
  _schemas: z
    .record(
      z.object({
        input: z.record(z.unknown()).describe("JSON Schema for step input"),
        output: z.record(z.unknown()).describe("JSON Schema for step output"),
      }),
    )
    .optional()
    .describe("Cached schemas extracted from transform steps"),
});

export type Workflow = z.infer<typeof WorkflowSchema>;

// ============================================================================
// Execution Schemas
// ============================================================================

/**
 * Phase Result - Result of executing a phase
 */
export const PhaseResultSchema = z.object({
  phaseIndex: z.number(),
  steps: z.record(
    z.object({
      status: z.enum(["completed", "failed", "skipped"]),
      output: z.unknown().optional(),
      error: z.string().optional(),
      iterations: z
        .array(
          z.object({
            index: z.number(),
            item: z.unknown(),
            output: z.unknown().optional(),
            error: z.string().optional(),
          }),
        )
        .optional(),
      startedAt: z.number(),
      completedAt: z.number().optional(),
    }),
  ),
  startedAt: z.number(),
  completedAt: z.number().optional(),
});

export type PhaseResult = z.infer<typeof PhaseResultSchema>;

/**
 * Execution State - Full execution state for a workflow
 */
export const ExecutionStateSchema = z.object({
  workflowId: z.string(),
  executionId: z.string(),
  status: z.enum(["pending", "running", "completed", "failed", "cancelled"]),
  inputs: z.record(z.unknown()).optional(),
  output: z.unknown().optional(),
  currentPhaseIndex: z.number().default(0),
  phases: z.array(PhaseResultSchema).default([]),
  error: z.string().optional(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  triggers: z
    .array(
      z.object({
        triggerId: z.string(),
        status: z.enum(["pending", "triggered", "skipped", "failed"]),
        executionIds: z.array(z.string()).optional(),
        error: z.string().optional(),
      }),
    )
    .optional(),
});

export type ExecutionState = z.infer<typeof ExecutionStateSchema>;

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Validation Error - Error during workflow validation
 */
export const ValidationErrorSchema = z.object({
  type: z.enum([
    "missing_ref",
    "type_mismatch",
    "missing_schema",
    "invalid_typescript",
  ]),
  step: z.string(),
  field: z.string(),
  ref: z.string().optional(),
  expected: z.record(z.unknown()).optional(),
  actual: z.record(z.unknown()).optional(),
  message: z.string(),
});

export type ValidationError = z.infer<typeof ValidationErrorSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a step has exactly one type defined
 */
export function validateStepType(step: Step): boolean {
  const types = [step.tool, step.transform, step.sleep].filter(Boolean);
  return types.length === 1;
}

/**
 * Get the step type
 */
export function getStepType(
  step: Step,
): "tool" | "transform" | "sleep" | "invalid" {
  if (step.tool) return "tool";
  if (step.transform) return "transform";
  if (step.sleep) return "sleep";
  return "invalid";
}

/**
 * Flatten phases to get all step names
 */
export function getAllStepNames(workflow: Workflow): string[] {
  return workflow.steps.flatMap((phase) => phase.map((step) => step.name));
}

/**
 * Get steps available in previous phases
 */
export function getAvailableSteps(
  workflow: Workflow,
  currentPhaseIndex: number,
): Map<string, number> {
  const available = new Map<string, number>();
  for (let i = 0; i < currentPhaseIndex; i++) {
    for (const step of workflow.steps[i]) {
      available.set(step.name, i);
    }
  }
  return available;
}
