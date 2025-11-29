/**
 * Workflow Validation
 *
 * Validates workflow definitions at creation time:
 * - Step type validation (exactly one of tool/transform/sleep)
 * - @ref validation (references point to valid steps/paths)
 * - Schema extraction from transform steps
 * - Type compatibility between step outputs and inputs
 *
 * @see docs/WORKFLOW_SCHEMA_DESIGN.md
 */

import { getStepType, ValidationError } from "./schema.ts";
import { extractRefs, parseAtRef } from "./ref-resolver.ts";
import { validateCode } from "./transform-executor.ts";
import {
  CodeActionSchema,
  Step,
  Trigger,
  Workflow,
} from "../collections/workflow.ts";

// ============================================================================
// Validation Result
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  schemas?: Record<
    string,
    {
      input: Record<string, unknown>;
      output: Record<string, unknown>;
    }
  >;
}

// ============================================================================
// Step Validators
// ============================================================================

/**
 * Validate @refs in a step's input
 */
function validateStepRefs(
  step: Step,
  availableSteps: Map<string, number>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Get all @refs used in this step
  const refs = extractRefs(step.input || {});

  // Also check forEach ref
  if (step.forEach) {
    refs.push(step.forEach);
  }

  for (const ref of refs) {
    const parsed = parseAtRef(ref as `@${string}`);

    switch (parsed.type) {
      case "step": {
        const stepName = parsed.stepName;
        if (!stepName) {
          errors.push({
            type: "missing_ref",
            step: step.name,
            field: "input",
            ref,
            message: `Invalid step reference: ${ref}`,
          });
          continue;
        }

        // Check if step exists in previous phases
        const stepPhase = availableSteps.get(stepName);
        if (stepPhase === undefined) {
          errors.push({
            type: "missing_ref",
            step: step.name,
            field: "input",
            ref,
            message: `Step '${stepName}' not found in previous phases. Available: ${Array.from(availableSteps.keys()).join(", ") || "none"}`,
          });
        }
        break;
      }

      case "input":
        // Input refs are always valid at this stage (validated at execution time)
        break;

      case "item":
      case "index":
        // Only valid if step has forEach
        if (!step.forEach) {
          errors.push({
            type: "missing_ref",
            step: step.name,
            field: "input",
            ref,
            message: `@${parsed.type} used but step has no forEach`,
          });
        }
        break;

      case "output":
        // Only valid in triggers (not step inputs)
        errors.push({
          type: "missing_ref",
          step: step.name,
          field: "input",
          ref,
          message: `@output is only valid in triggers, not step inputs`,
        });
        break;
    }
  }

  return errors;
}

/**
 * Validate a transform step's TypeScript code
 */
async function validateCodeStep(step: Step): Promise<{
  error: ValidationError | null;
  schema?: { input: Record<string, unknown>; output: Record<string, unknown> };
}> {
  const parsed = CodeActionSchema.safeParse(step.action);
  const isCodeAction = parsed.success;
  if (!isCodeAction) {
    return { error: null };
  }

  const codeAction = parsed.data;
  const result = await validateCode(codeAction.code, step.name);

  if (!result.valid) {
    return {
      error: {
        type: "invalid_typescript",
        step: step.name,
        field: "code",
        message: result.error || "Invalid TypeScript code",
      },
    };
  }

  return {
    error: null,
    schema: result.schemas,
  };
}

// ============================================================================
// Trigger Validators
// ============================================================================

/**
 * Validate @refs in trigger inputs
 */
function validateTriggerRefs(
  trigger: Trigger,
  triggerIndex: number,
  allStepNames: Set<string>,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const triggerId = `trigger-${triggerIndex}`;

  const refs = extractRefs(trigger.inputs);

  // Also check forEach ref
  if (trigger.forEach) {
    refs.push(trigger.forEach);
  }

  for (const ref of refs) {
    const parsed = parseAtRef(ref as `@${string}`);

    switch (parsed.type) {
      case "output":
        // Valid in triggers
        break;

      case "step": {
        const stepName = parsed.stepName;
        if (!stepName || !allStepNames.has(stepName)) {
          errors.push({
            type: "missing_ref",
            step: triggerId,
            field: "inputs",
            ref,
            message: `Step '${stepName}' not found in workflow`,
          });
        }
        break;
      }

      case "input":
        // Valid - can reference workflow input
        break;

      case "item":
      case "index":
        if (!trigger.forEach) {
          errors.push({
            type: "missing_ref",
            step: triggerId,
            field: "inputs",
            ref,
            message: `@${parsed.type} used but trigger has no forEach`,
          });
        }
        break;
    }
  }

  return errors;
}

// ============================================================================
// Main Validator
// ============================================================================

/**
 * Validate a workflow definition
 *
 * Returns validation errors and extracted schemas for caching.
 */
export async function validateWorkflow(
  workflow: Workflow,
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const schemas: Record<
    string,
    { input: Record<string, unknown>; output: Record<string, unknown> }
  > = {};

  // Track all step names for uniqueness check
  const stepNames = new Set<string>();
  const duplicateNames = new Set<string>();

  // Build available steps map as we go
  const availableSteps = new Map<string, number>();

  // Validate phases
  for (let phaseIndex = 0; phaseIndex < workflow.steps.length; phaseIndex++) {
    const phase = workflow.steps[phaseIndex];

    for (const step of phase) {
      // Check for duplicate names
      if (stepNames.has(step.name)) {
        duplicateNames.add(step.name);
      }
      stepNames.add(step.name);

      // Validate @refs
      const refErrors = validateStepRefs(step, availableSteps);
      errors.push(...refErrors);
      const stepType = getStepType(step);

      // Validate transform steps
      if (stepType.type === "code") {
        const { error, schema } = await validateCodeStep(step);
        if (error) errors.push(error);
        if (schema) schemas[step.name] = schema;
      }

      // Validate forEach maxIterations
      if (
        step.forEach &&
        step.maxIterations !== undefined &&
        step.maxIterations <= 0
      ) {
        errors.push({
          type: "invalid_typescript",
          step: step.name,
          field: "maxIterations",
          message: "maxIterations must be positive",
        });
      }
    }

    // After validating phase, add its steps to available map
    for (const step of phase) {
      availableSteps.set(step.name, phaseIndex);
    }
  }

  // Report duplicate names
  for (const name of duplicateNames) {
    errors.push({
      type: "invalid_typescript",
      step: name,
      field: "name",
      message: `Duplicate step name: ${name}`,
    });
  }

  // Validate triggers
  if (workflow.triggers) {
    for (let i = 0; i < workflow.triggers.length; i++) {
      const trigger = workflow.triggers[i];
      const triggerErrors = validateTriggerRefs(trigger, i, stepNames);
      errors.push(...triggerErrors);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    schemas: Object.keys(schemas).length > 0 ? schemas : undefined,
  };
}
