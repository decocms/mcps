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
import type { Env } from "../../types/env.ts";
import { getStepType } from "server/types/step-types.ts";

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
            message: `Step '${stepName}' not found in previous steps. Available: ${Array.from(availableSteps.keys()).join(", ") || "none"}`,
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
  const currentPermissions = await env.CONNECTION.COLLECTION_CONNECTIONS_GET({
    id: env.MESH_REQUEST_CONTEXT?.connectionId || "",
  });
  const externalConnections = getWorkflowExternalConnections(workflow);

  const availableSteps = new Map<string, number>();
  const currentConfigurationState = currentPermissions.item.configuration_state;
  const newConnections = externalConnections.filter(
    (connectionId) =>
      !currentPermissions.item.configuration_state[
        connectionId as keyof typeof currentPermissions.item.configuration_state
      ],
  );

  await env.CONNECTION.COLLECTION_CONNECTIONS_UPDATE({
    id: env.MESH_REQUEST_CONTEXT?.connectionId || "",
    data: {
      configuration_scopes: Object.keys(currentConfigurationState)
        .filter((key) => key !== "")
        .map((key) => `${key}::*`),
      configuration_state: {
        ...currentPermissions.item.configuration_state,
        ...newConnections
          .filter((connectionId) => connectionId !== "")
          .reduce(
            (acc, connectionId) => ({
              ...acc,
              [connectionId]: {
                value: connectionId,
              },
            }),
            {},
          ),
      },
    },
  });

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
