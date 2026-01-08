/**
 * Workflow Validation
 *
 * Validates workflow definitions at creation time:
 * - Step type validation (exactly one of tool/transform/sleep)
 * - @ref validation (references point to valid steps/paths)
 * - Schema extraction from transform steps
 * - Type compatibility between step outputs and inputs
 * - Transform input validation against tool output schemas
 * - Permission token management for tool steps
 *
 * @see docs/WORKFLOW_SCHEMA_DESIGN.md
 */

import {
  CodeActionSchema,
  ToolCallActionSchema,
  type Step,
  type Workflow,
} from "@decocms/bindings/workflow";
import z from "zod";
import {
  extractSchemas,
  injectInputInterface,
  jsonSchemaToTypeScript,
  needsInputInjection,
  validateCode,
} from "../engine/steps/code-step.ts";
import type { Env } from "../types/env.ts";
import { getStepType } from "../types/step.ts";
import { extractRefs, parseAtRef } from "./ref-resolver.ts";

export const ValidationErrorSchema = z.object({
  type: z.enum([
    "missing_ref",
    "type_mismatch",
    "missing_schema",
    "invalid_typescript",
    "schema_mismatch",
  ]),
  step: z.string(),
  field: z.string(),
  ref: z.string().optional(),
  expected: z.record(z.string(), z.unknown()).optional(),
  actual: z.record(z.string(), z.unknown()).optional(),
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
 * Tool definition from connections
 */
interface ToolDefinition {
  name: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

/**
 * Get a property from a JSON schema by path
 */
function getSchemaPropertyByPath(
  schema: Record<string, unknown>,
  path: string,
): Record<string, unknown> | undefined {
  if (!path) return schema;

  const keys = path.split(".");
  let current = schema;

  for (const key of keys) {
    // Handle array index access
    if (current.type === "array" && current.items) {
      current = current.items as Record<string, unknown>;
      continue;
    }

    // Handle object property access
    const properties = current.properties as
      | Record<string, Record<string, unknown>>
      | undefined;
    if (!properties || !properties[key]) {
      return undefined;
    }
    current = properties[key];
  }

  return current;
}

/**
 * Check if two JSON schema types are compatible
 */
function areTypesCompatible(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
): boolean {
  // If either is 'any' or empty (unknown), they're compatible
  if (!expected.type || !actual.type) return true;

  // Direct type match
  if (expected.type === actual.type) return true;

  // Number/integer compatibility
  if (
    (expected.type === "number" && actual.type === "integer") ||
    (expected.type === "integer" && actual.type === "number")
  ) {
    return true;
  }

  return false;
}

/**
 * Validate @refs in a step's input against available step output schemas
 */
function validateStepRefs(
  step: Step,
  availableSteps: Map<string, number>,
  stepOutputSchemas: Map<string, Record<string, unknown>>,
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
          continue;
        }

        // Validate path exists in step's output schema
        const outputSchema = stepOutputSchemas.get(stepName);
        if (outputSchema && parsed.path) {
          const pathSchema = getSchemaPropertyByPath(outputSchema, parsed.path);
          if (!pathSchema) {
            errors.push({
              type: "schema_mismatch",
              step: step.name,
              field: "input",
              ref,
              message: `Path '${parsed.path}' not found in output schema of step '${stepName}'. Available properties: ${
                outputSchema.properties
                  ? Object.keys(outputSchema.properties as object).join(", ")
                  : "none"
              }`,
            });
          }
        }
        break;
      }
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
 * Validate transform code against tool's output schema
 * The transform receives the tool's output, so Input interface should match
 */
function validateTransformAgainstToolOutput(
  step: Step,
  transformCode: string,
  toolOutputSchema: Record<string, unknown>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  try {
    const schemas = extractSchemas(transformCode);
    const transformInputSchema = schemas.input;

    // Check that transform's Input properties exist in tool output
    const transformProps = transformInputSchema.properties as
      | Record<string, Record<string, unknown>>
      | undefined;
    const toolProps = toolOutputSchema.properties as
      | Record<string, Record<string, unknown>>
      | undefined;

    if (transformProps && Object.keys(transformProps).length > 0) {
      // Transform expects specific properties - validate they exist in tool output
      for (const [propName, propSchema] of Object.entries(transformProps)) {
        // Skip 'any' or 'unknown' typed properties
        if (!propSchema.type || propSchema.type === "object") continue;

        if (!toolProps || !toolProps[propName]) {
          // Property expected by transform not in tool output
          // This is a warning - the tool might still return it dynamically
          // But for LLM tools with content array, this is likely wrong

          // Special check: if transform expects 'text' but tool returns 'content' array
          if (propName === "text" && toolProps?.content) {
            errors.push({
              type: "schema_mismatch",
              step: step.name,
              field: "action.transformCode",
              message: `Transform expects 'input.text' but tool returns 'content' array. Use 'input.content[0].text' or 'input?.content?.find(c => c.type === "text")?.text' instead.`,
              expected: { text: propSchema },
              actual: toolOutputSchema,
            });
          } else {
            errors.push({
              type: "schema_mismatch",
              step: step.name,
              field: "action.transformCode",
              message: `Transform expects property '${propName}' but it's not in tool output schema. Available: ${
                toolProps ? Object.keys(toolProps).join(", ") : "none"
              }`,
              expected: { [propName]: propSchema },
              actual: toolOutputSchema,
            });
          }
        } else if (toolProps[propName]) {
          // Property exists - validate type compatibility
          if (!areTypesCompatible(propSchema, toolProps[propName])) {
            errors.push({
              type: "type_mismatch",
              step: step.name,
              field: "action.transformCode",
              message: `Transform expects '${propName}' to be ${propSchema.type} but tool output has ${toolProps[propName].type}`,
              expected: propSchema,
              actual: toolProps[propName],
            });
          }
        }
      }
    }
  } catch (e) {
    // Schema extraction failed - not a fatal error, just skip validation
    console.warn(
      `[VALIDATOR] Could not extract schemas from transform code in step '${step.name}':`,
      e,
    );
  }

  return errors;
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

  // Build map of step output schemas for @ref validation
  const stepOutputSchemas = new Map<string, Record<string, unknown>>();

  // Some MCP clients send `undefined` when a tool has no arguments.
  // The Connection binding expects an object input for LIST, so always pass `{}`.
  const connectionsResult =
    await env.MESH_REQUEST_CONTEXT.state.CONNECTION.COLLECTION_CONNECTIONS_LIST(
      {},
    );
  const connections = (
    connectionsResult as { items: Array<{ tools: ToolDefinition[] }> }
  ).items;
  const currentTools: ToolDefinition[] = connections.flatMap(
    (connection) => connection.tools,
  );

  const availableSteps = new Map<string, number>();

  const steps = workflow.steps || [];

  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    const step = steps[stepIndex];
    const stepType = getStepType(step);

    // Check for duplicate step names
    if (stepNames.has(step.name)) {
      duplicateNames.add(step.name);
    }
    stepNames.add(step.name);

    // Validate tool steps
    if (stepType === "tool") {
      const toolAction = ToolCallActionSchema.safeParse(step.action);
      if (!toolAction.success) {
        errors.push({
          type: "invalid_typescript",
          step: step.name,
          field: "action",
          message: `Invalid tool action: ${toolAction.error.message}`,
        });
        continue;
      }

      const { toolName, transformCode } = toolAction.data;
      const tool = currentTools.find((t) => t.name === toolName);

      if (!tool) {
        errors.push({
          type: "missing_ref",
          step: step.name,
          field: "action.toolName",
          ref: toolName,
          message: `Tool '${toolName}' not found in connections. Available: ${currentTools
            .map((t) => t.name)
            .join(", ")}`,
        });
      }

      // biome-ignore lint/suspicious/noExplicitAny: hard typings
      const toolOutputSchema = (tool?.outputSchema as any) ?? {};

      if (transformCode) {
        let processedTransformCode = transformCode;

        // If transform code needs Input injection (no Input interface or uses `any`)
        // inject proper Input interface from tool's output schema
        if (tool?.outputSchema && needsInputInjection(transformCode)) {
          const inputInterface = jsonSchemaToTypeScript(
            toolOutputSchema,
            "Input",
          );
          processedTransformCode = injectInputInterface(
            transformCode,
            inputInterface,
          );

          // Update the step's action with the processed transform code
          (step.action as { transformCode: string }).transformCode =
            processedTransformCode;

          console.log(
            `[VALIDATOR] Injected Input interface for step '${step.name}'`,
          );
        }

        // Validate transform code compiles
        const transformResult = await validateCode(
          processedTransformCode,
          step.name,
        );
        if (!transformResult.valid) {
          errors.push({
            type: "invalid_typescript",
            step: step.name,
            field: "action.transformCode",
            message: transformResult.error || "Invalid transform code",
          });
        } else {
          // Validate transform input against tool output schema
          if (tool?.outputSchema) {
            const transformErrors = validateTransformAgainstToolOutput(
              step,
              processedTransformCode,
              toolOutputSchema,
            );
            errors.push(...transformErrors);
          }

          // Step output is the transform's output
          if (transformResult.schemas?.output) {
            stepOutputSchemas.set(step.name, transformResult.schemas.output);
            // biome-ignore lint/suspicious/noExplicitAny: hard typings
            step.outputSchema = transformResult.schemas.output as any;
          }
        }
      } else {
        // No transform - step output is tool's output
        stepOutputSchemas.set(step.name, toolOutputSchema);
        // biome-ignore lint/suspicious/noExplicitAny: hard typings
        step.outputSchema = toolOutputSchema;
      }
    }

    // Validate code steps
    if (stepType === "code") {
      const { error, schema } = await validateCodeStep(step);
      if (error) errors.push(error);
      if (schema) {
        schemas[step.name] = schema;
        stepOutputSchemas.set(step.name, schema.output);
        // biome-ignore lint/suspicious/noExplicitAny: hard typings
        step.outputSchema = schema.output as any;
      }
    }

    // Validate @refs in step input against available schemas
    const refErrors = validateStepRefs(step, availableSteps, stepOutputSchemas);
    errors.push(...refErrors);

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
