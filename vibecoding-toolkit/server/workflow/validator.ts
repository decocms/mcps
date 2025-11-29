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

import type { Workflow, Step, ValidationError, Trigger } from "./schema.ts";
import { getStepType, validateStepType } from "./schema.ts";
import { extractRefs, parseAtRef } from "./ref-resolver.ts";
import { validateTransformCode } from "./transform-executor.ts";

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
 * Validate that a step has exactly one type defined
 */
function validateStepHasOneType(step: Step): ValidationError | null {
  if (!validateStepType(step)) {
    return {
      type: "invalid_typescript",
      step: step.name,
      field: "type",
      message: `Step must have exactly one of: tool, transform, or sleep`,
    };
  }
  return null;
}

/**
 * Validate @refs in a step's input
 */
function validateStepRefs(
  step: Step,
  _phaseIndex: number,
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
async function validateTransformStep(
  step: Step,
): Promise<{
  error: ValidationError | null;
  schema?: { input: Record<string, unknown>; output: Record<string, unknown> };
}> {
  if (!step.transform) {
    return { error: null };
  }

  const result = await validateTransformCode(step.transform, step.name);

  if (!result.valid) {
    return {
      error: {
        type: "invalid_typescript",
        step: step.name,
        field: "transform",
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
export async function validateWorkflow(workflow: Workflow): Promise<ValidationResult> {
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

      // Validate step has exactly one type
      const typeError = validateStepHasOneType(step);
      if (typeError) {
        errors.push(typeError);
        continue;
      }

      // Validate @refs
      const refErrors = validateStepRefs(step, phaseIndex, availableSteps);
      errors.push(...refErrors);

      // Validate transform steps
      if (step.transform) {
        const { error, schema } = await validateTransformStep(step);
        if (error) {
          errors.push(error);
        }
        if (schema) {
          schemas[step.name] = schema;
        }
      }

      // Validate forEach maxIterations
      if (step.forEach && step.maxIterations !== undefined && step.maxIterations <= 0) {
        errors.push({
          type: "invalid_typescript",
          step: step.name,
          field: "maxIterations",
          message: "maxIterations must be positive",
        });
      }

      // Validate retry config is only on tool steps
      if (step.retry && getStepType(step) !== "tool") {
        errors.push({
          type: "invalid_typescript",
          step: step.name,
          field: "retry",
          message: "retry configuration is only valid for tool steps",
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

/**
 * Quick validation without schema extraction (for updates)
 */
export function validateWorkflowSync(workflow: Workflow): ValidationResult {
  const errors: ValidationError[] = [];

  const stepNames = new Set<string>();
  const duplicateNames = new Set<string>();
  const availableSteps = new Map<string, number>();

  for (let phaseIndex = 0; phaseIndex < workflow.steps.length; phaseIndex++) {
    const phase = workflow.steps[phaseIndex];

    for (const step of phase) {
      if (stepNames.has(step.name)) {
        duplicateNames.add(step.name);
      }
      stepNames.add(step.name);

      const typeError = validateStepHasOneType(step);
      if (typeError) {
        errors.push(typeError);
        continue;
      }

      const refErrors = validateStepRefs(step, phaseIndex, availableSteps);
      errors.push(...refErrors);
    }

    for (const step of phase) {
      availableSteps.set(step.name, phaseIndex);
    }
  }

  for (const name of duplicateNames) {
    errors.push({
      type: "invalid_typescript",
      step: name,
      field: "name",
      message: `Duplicate step name: ${name}`,
    });
  }

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
  };
}
