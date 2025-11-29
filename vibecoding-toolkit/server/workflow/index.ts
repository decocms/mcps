/**
 * Workflow Engine - Phase-Based Workflow System
 *
 * This module implements the workflow schema design from WORKFLOW_SCHEMA_DESIGN.md:
 *
 * - Phase-based parallelism: Steps within phases run in parallel, phases run sequentially
 * - Unified step schema: tool, transform, sleep steps in one schema
 * - Pure transform execution: TypeScript in QuickJS sandbox (deterministic)
 * - ForEach loops: Iterate over arrays in steps and triggers
 * - Trigger chaining: Fire other workflows on completion
 * - @ref resolution: Reference previous step outputs, workflow input, loop items
 *
 * @example
 * ```typescript
 * // Create a workflow with parallel processing
 * const workflow = {
 *   name: "parallel-pipeline",
 *   steps: [
 *     // Phase 0: Single step
 *     [{ name: "fetch", tool: { connectionId: "api", toolName: "get-data" } }],
 *
 *     // Phase 1: Parallel processing
 *     [
 *       { name: "processA", tool: { ... }, input: { data: "@fetch.output.items" } },
 *       { name: "processB", tool: { ... }, input: { data: "@fetch.output.items" } },
 *     ],
 *
 *     // Phase 2: Transform (pure TypeScript)
 *     [{
 *       name: "combine",
 *       transform: `
 *         interface Input { a: number[]; b: number[]; }
 *         interface Output { combined: number[]; }
 *         export default (input: Input): Output => ({
 *           combined: [...input.a, ...input.b]
 *         });
 *       `,
 *       input: { a: "@processA.output", b: "@processB.output" }
 *     }]
 *   ],
 *   triggers: [
 *     {
 *       workflowId: "downstream-workflow",
 *       inputs: { data: "@output.combined" }
 *     }
 *   ]
 * };
 * ```
 *
 * @see docs/WORKFLOW_SCHEMA_DESIGN.md for full documentation
 */

// Schema exports
export { getStepType } from "./schema.ts";

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
} from "./transform-executor.ts";

// Workflow executor exports
export {
  executeWorkflow,
  type StepExecutionResult,
  type PhaseExecutionResult,
  type WorkflowExecutionResult,
  type ExecutorConfig,
} from "./executor.ts";

// Validation exports
export { validateWorkflow, type ValidationResult } from "./validator.ts";
