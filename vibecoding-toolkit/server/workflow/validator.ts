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

function validateTriggerRefs(
  trigger: Trigger,
  triggerIndex: number,
  allStepNames: Set<string>,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const triggerId = `trigger-${triggerIndex}`;

  const refs = extractRefs(trigger.input);

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
            field: "input",
            ref,
            message: `Step '${stepName}' not found in workflow`,
          });
        }
        break;
      }

      case "input":
        break;
    }
  }

  return errors;
}

export async function validateWorkflow(
  workflow: Workflow,
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const schemas: Record<
    string,
    { input: Record<string, unknown>; output: Record<string, unknown> }
  > = {};

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

      const refErrors = validateStepRefs(step, availableSteps);
      errors.push(...refErrors);
      const stepType = getStepType(step);

      if (stepType.type === "code") {
        const { error, schema } = await validateCodeStep(step);
        if (error) errors.push(error);
        if (schema) schemas[step.name] = schema;
      }
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
    schemas: Object.keys(schemas).length > 0 ? schemas : undefined,
  };
}
