/**
 * Workflow Validation
 *
 * Validates workflow definitions at creation time:
 * - Step type validation (exactly one of tool/transform/sleep)
 * - @ref validation (references point to valid steps/paths)
 * - Schema extraction from transform steps
 * - Type compatibility between step outputs and inputs
 * - Permission token management for tool steps
 *
 * @see docs/WORKFLOW_SCHEMA_DESIGN.md
 */

import z from "zod";
import { extractRefs, parseAtRef } from "./ref-resolver.ts";
import { validateCode } from "../steps/code-step.ts";
import { CodeActionSchema, Step, Workflow } from "@decocms/bindings/workflow";
import { getStepType } from "../steps/step-executor.ts";

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

/**
 * Validation result
 */
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

  // Check if this step has forEach config (allows @item and @index)
  const hasForEach = !!step.config?.loop?.for;

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

/**
 * Known state binding keys that can be used in scopes
 * External connections (starting with "conn_") are handled via USED_TOOLS
 */
const STATE_BINDING_KEYS = new Set(["DATABASE", "EVENT_BUS"]);

/**
 * Check if a connection ID is an external connection (not a state binding)
 */
const isExternalConnection = (connectionId: string): boolean => {
  return (
    connectionId.startsWith("conn_") || !STATE_BINDING_KEYS.has(connectionId)
  );
};

/**
 * Extract a scope from a step that has a tool action (connectionId + toolName)
 * Returns null for non-tool steps (code, sleep, waitForSignal)
 * Returns null for external connections (those are validated via USED_TOOLS at runtime)
 */
const getStepScope = (step: Step): string | null => {
  if (
    typeof step.action === "object" &&
    step.action !== null &&
    "connectionId" in step.action &&
    "toolName" in step.action
  ) {
    const connectionId = step.action.connectionId;

    // Skip external connections - they're validated via USED_TOOLS at runtime
    if (isExternalConnection(connectionId)) {
      return null;
    }

    return `${connectionId}::${step.action.toolName}`;
  }
  return null;
};

/**
 * Extract external connection IDs from workflow steps
 * These need to be validated against USED_TOOLS.connections at save/runtime
 */
export function getWorkflowExternalConnections(workflow: Workflow): string[] {
  const connections = new Set<string>();

  for (const step of workflow.steps || []) {
    if (
      typeof step.action === "object" &&
      step.action !== null &&
      "connectionId" in step.action
    ) {
      const connectionId = step.action.connectionId;
      if (isExternalConnection(connectionId)) {
        connections.add(connectionId);
      }
    }
  }

  return Array.from(connections);
}

/**
 * Extract all unique scopes from a workflow's steps
 * Only includes steps that have tool actions with STATE BINDING keys (not external connections)
 * External connections are validated via USED_TOOLS at runtime
 *
 * @param workflow - The workflow to extract scopes from
 * @returns Array of unique scopes in format "stateBindingKey::toolName"
 */
export function getWorkflowScopes(workflow: Workflow): string[] {
  const scopes = new Set<string>();

  for (const step of workflow.steps || []) {
    const scope = getStepScope(step);
    if (scope) {
      scopes.add(scope);
    }
  }

  return Array.from(scopes);
}

export async function validateWorkflow(workflow: Workflow): Promise<void> {
  const errors: ValidationError[] = [];
  const schemas: Record<
    string,
    { input: Record<string, unknown>; output: Record<string, unknown> }
  > = {};

  const stepNames = new Set<string>();
  const duplicateNames = new Set<string>();

  const availableSteps = new Map<string, number>();

  // Steps is now a flat array (no phases)
  const steps = workflow.steps || [];

  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    const step = steps[stepIndex];

    if (stepNames.has(step.name)) {
      duplicateNames.add(step.name);
    }
    stepNames.add(step.name);

    const refErrors = validateStepRefs(step, availableSteps);
    errors.push(...refErrors);
    const stepType = getStepType(step);

    if (stepType === "code") {
      const { error, schema } = await validateCodeStep(step);
      if (error) errors.push(error);
      if (schema) schemas[step.name] = schema;
    }

    // Make this step available for subsequent steps to reference
    availableSteps.set(step.name, stepIndex);
  }

  for (const name of duplicateNames) {
    errors.push({
      type: "invalid_typescript",
      step: name,
      field: "name",
      message: `Duplicate step name: ${name}`,
    });
  }

  if (errors.length > 0) {
    throw new Error(JSON.stringify(errors, null, 2));
  }
}
