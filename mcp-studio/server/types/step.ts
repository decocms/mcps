/**
 * Step Type Definitions
 *
 * Types for step execution results and extended step definitions.
 */

import type { Step as BaseStep, CodeAction } from "@decocms/bindings/workflow";

export type Step = BaseStep;

/**
 * Result of executing a single step.
 */
export interface StepResult {
  stepId: string;
  startedAt: number;
  completedAt?: number;
  output?: unknown;
  error?: string;
}

/**
 * Existing step result from database (for resuming executions).
 */
export interface ExistingStepResult {
  started_at_epoch_ms?: number | null;
  output?: unknown;
}

/**
 * Step type discriminator.
 */
export type StepType = "tool" | "code" | "signal";

/**
 * Determine the type of a step based on its action.
 */
export function getStepType(step: Step): StepType {
  if ("toolName" in step.action) return "tool";
  if ("code" in step.action) return "code";
  if ("signalName" in step.action) return "signal";
  throw new Error(`Unknown step type for step: ${step.name}`);
}

/**
 * Type guard for code action.
 */
export function isCodeAction(action: Step["action"]): action is CodeAction {
  return "code" in action;
}
