/**
 * Workflow Engine - Auto-Parallel Workflow System
 *
 * This module implements the workflow schema design:
 *
 * - Auto-parallelization: Steps are automatically grouped by @ref dependencies
 *   - Steps with no step dependencies run in parallel (level 0)
 *   - Steps depending on level N run at level N+1
 *   - No manual phase configuration needed!
 * - ForEach loops: Iterate over arrays with configurable execution modes
 *   - sequential: Process items one at a time (default)
 *   - parallel: Process all items at once (Promise.all)
 *   - race: Return first successful result (Promise.race)
 *   - allSettled: Wait for all, collect successes and failures (Promise.allSettled)
 * - Unified step schema: tool, transform, sleep steps in one schema
 * - Pure transform execution: TypeScript in QuickJS sandbox (deterministic)
 * - Trigger chaining: Fire other workflows on completion
 * - @ref resolution: Reference previous step outputs, workflow input, loop items
 *
 * @example Auto-parallelization
 * ```typescript
 * const workflow = {
 *   steps: [
 *     // These two run in parallel (no dependencies)
 *     { name: "fetchA", action: { toolName: "get-a" } },
 *     { name: "fetchB", action: { toolName: "get-b" } },
 *     // This waits for both, then runs
 *     { name: "combine", input: { a: "@fetchA.output", b: "@fetchB.output" } }
 *   ]
 * };
 * ```
 *
 * @example ForEach with parallel processing
 * ```typescript
 * const workflow = {
 *   steps: [
 *     { name: "fetchItems", action: { toolName: "get-items" } },
 *     {
 *       name: "processEach",
 *       action: { toolName: "process" },
 *       input: { item: "@item", index: "@index" },
 *       config: {
 *         forEach: {
 *           items: "@fetchItems.output.items",
 *           mode: "parallel",      // or "sequential", "race", "allSettled"
 *           maxConcurrency: 5      // optional limit for parallel
 *         }
 *       }
 *     }
 *   ]
 * };
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

// Control flow exports (forEach, parallel modes)
export {
  type ForEachConfig,
  type ParallelGroupConfig,
  type StepConfig,
  type ForEachMode,
  type ParallelMode,
  type ForEachResult,
  parseStepConfig,
  hasForEach,
  executeWithMode,
  createIterationContext,
} from "./control-flow.ts";
