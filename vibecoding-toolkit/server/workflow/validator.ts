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

import z from "zod";
import { extractRefs, parseAtRef } from "./ref-resolver.ts";
import { validateCode } from "./code-step.ts";
import {
  CodeActionSchema,
  Step,
  Trigger,
  Workflow,
} from "@decocms/bindings/workflow";
import { getStepType } from "./step-executor.ts";

// ============================================================================
// Validation Result
// ============================================================================

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

export interface ValidationResult {
  valid: boolean;
  errors: unknown[];
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
  availableGroups: Set<string>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Get all @refs used in this step
  const refs = extractRefs(step.input || {});

  // Check if this step has forEach config (allows @item and @index)
  const hasForEach = !!(step as any).config?.forEach;

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

        // Check if step exists in previous steps
        const stepIndex = availableSteps.get(stepName);
        if (stepIndex === undefined) {
          errors.push({
            type: "missing_ref",
            step: step.name,
            field: "input",
            ref,
            message: `Step '${stepName}' not found in previous steps. Available: ${Array.from(availableSteps.keys()).join(", ") || "none"}`,
          });
        }
        break;
      }

      case "input":
        // Input refs are always valid at this stage (validated at execution time)
        break;

      case "item":
      case "index":
        // @item and @index are valid only in steps with forEach config
        if (!hasForEach) {
          errors.push({
            type: "missing_ref",
            step: step.name,
            field: "input",
            ref,
            message: `${ref} is only valid in steps with forEach config`,
          });
        }
        break;

      case "group":
        // @group:xxx refs are valid if the group was defined in a previous step
        if (parsed.groupId && !availableGroups.has(parsed.groupId)) {
          errors.push({
            type: "missing_ref",
            step: step.name,
            field: "input",
            ref,
            message: `Group '${parsed.groupId}' not found in previous steps`,
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
  const availableGroups = new Set<string>();

  // Steps is now a flat array (no phases)
  const steps = workflow.steps || [];

  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    const step = steps[stepIndex];

    if (stepNames.has(step.name)) {
      duplicateNames.add(step.name);
    }
    stepNames.add(step.name);

    const refErrors = validateStepRefs(step, availableSteps, availableGroups);
    errors.push(...refErrors);
    const stepType = getStepType(step);

    if (stepType === "code") {
      const { error, schema } = await validateCodeStep(step);
      if (error) errors.push(error);
      if (schema) schemas[step.name] = schema;
    }

    // Make this step available for subsequent steps to reference
    availableSteps.set(step.name, stepIndex);

    // Track parallel groups
    const parallelConfig = (step as any).config?.parallel;
    if (parallelConfig?.group) {
      availableGroups.add(parallelConfig.group);
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
