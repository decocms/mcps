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
import { validateCode } from "../engine/steps/code-step.ts";
import {
  CodeActionSchema,
  Step,
  ToolCallAction,
  Workflow,
} from "@decocms/bindings/workflow";
import type { Env } from "../types/env.ts";
import { getStepType } from "../types/step.ts";

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
            message: `Step '${stepName}' not found in previous steps. Available: ${
              Array.from(availableSteps.keys()).join(", ") || "none"
            }`,
          });
        }
        break;
      }

      case "input":
        // Input refs are always valid at this stage (validated at execution time)
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

export async function validateWorkflow(
  workflow: Workflow,
  env: Env,
): Promise<void> {
  const errors: ValidationError[] = [];
  const schemas: Record<
    string,
    { input: Record<string, unknown>; output: Record<string, unknown> }
  > = {};
  const stepNames = new Set<string>();
  const duplicateNames = new Set<string>();
  // Some MCP clients send `undefined` when a tool has no arguments.
  // The Connection binding expects an object input for LIST, so always pass `{}`.
  const currentTools = (
    await env.CONNECTION.COLLECTION_CONNECTIONS_LIST({})
  ).items.flatMap((connection) => connection.tools);

  const availableSteps = new Map<string, number>();

  const steps = workflow.steps || [];

  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    const step = steps[stepIndex];

    const toolName = "toolName" in step.action ? step.action.toolName : null;
    if (toolName) {
      const tool = currentTools.find((tool) => tool.name === toolName);
      if (!tool) {
        errors.push({
          type: "missing_ref",
          step: step.name,
          field: "action.toolName",
          ref: toolName,
          message: `Tool '${toolName}' not found in connections. Available: ${currentTools
            .map((tool) => tool.name)
            .join(", ")}`,
        });
      }
      step.outputSchema = tool?.outputSchema as any;
    }

    if (stepNames.has(step.name)) {
      duplicateNames.add(step.name);
    }
    stepNames.add(step.name);

    const refErrors = validateStepRefs(step, availableSteps);
    errors.push(...refErrors);
    const stepType = getStepType(step);

    if (stepType === "tool") {
      const tool = currentTools.find(
        (tool) => tool.name === (step.action as ToolCallAction).toolName,
      );

      const transformCode = (step.action as ToolCallAction).transformCode;
      if (!transformCode) step.outputSchema = (tool?.outputSchema as any) ?? {}; // hacky, but works for now
    }

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
