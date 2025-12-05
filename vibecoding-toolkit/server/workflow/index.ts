/**
 * Workflow Engine - Auto-Parallel Workflow System
 *
 * This module implements the workflow schema design:
 *
 * - Auto-parallelization: Steps are automatically grouped by @ref dependencies
 *   - Steps with no step dependencies run in parallel (level 0)
 *   - Steps depending on level N run at level N+1
 *   - No manual phase configuration needed!
 * - Unified step schema: tool, transform, sleep steps in one schema
 * - Pure transform execution: TypeScript in QuickJS sandbox (deterministic)
 * - ForEach loops: Iterate over arrays in steps and triggers
 * - Trigger chaining: Fire other workflows on completion
 * - @ref resolution: Reference previous step outputs, workflow input, loop items
 *
 * @example
 * ```typescript
 * // Steps are automatically parallelized based on dependencies
 * const workflow = {
 *   name: "data-pipeline",
 *   steps: [
 *     // These two run in parallel (no dependencies)
 *     { name: "fetchA", action: { connectionId: "api", toolName: "get-a" } },
 *     { name: "fetchB", action: { connectionId: "api", toolName: "get-b" } },
 *
 *     // This waits for both fetchA and fetchB, then runs
 *     {
 *       name: "combine",
 *       action: { code: `...` },
 *       input: { a: "@fetchA.output", b: "@fetchB.output" }
 *     }
 *   ]
 * };
 * // Execution: [fetchA, fetchB] -> [combine]
 * ```
 */

// @ref resolution exports
export {
  type RefContext,
  type RefResolution,
  type ResolveResult,
  isAtRef,
  parseAtRef,
  getValueByPath,
  resolveRef,
  resolveAllRefs,
  canResolveAllRefs,
  extractRefs,
} from "./ref-resolver.ts";

// Transform executor exports
export {
  transpileTypeScript,
  extractSchemas,
  validateCode,
  type CodeResult,
} from "./code-step.ts";

// Workflow types
export type {
  StepExecutionResult,
  WorkflowExecutionResult,
  ExecutorConfig,
  TriggerResult,
  StreamingStepResult,
} from "./types.ts";

export { isStreamingResult } from "./types.ts";

// Workflow executor exports
export { executeWorkflow } from "./executor.ts";

// Workflow errors
export {
  WorkflowCancelledError,
  StepContentionError,
  ExecutionNotFoundError,
  MaxRetriesExceededError,
  DurableSleepError,
  WaitingForSignalError,
} from "./errors.ts";

export { createProxyConnection } from "./connection.ts";

// Validation exports
export { validateWorkflow, type ValidationResult } from "./validator.ts";

// Events API exports
export {
  // Core event functions
  addEvent,
  getPendingEvents,
  consumeEvent,
  sendSignal,
  scheduleTimer,
  checkTimer,
  wakeExecution,
} from "./events.ts";
