// ============================================================================
// Execution Schemas
// ============================================================================

import {
  SleepActionSchema,
  CodeActionSchema,
  ToolCallActionSchema,
  type Step,
} from "../collections/workflow.ts";
import { z } from "zod";

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Validation Error - Error during workflow validation
 */
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

// ============================================================================
// Helper Functions
// ============================================================================

export type ToolCallAction = z.infer<typeof ToolCallActionSchema>;
export type CodeAction = z.infer<typeof CodeActionSchema>;
export type SleepAction = z.infer<typeof SleepActionSchema>;

/**
 * Get the step type
 */
export function getStepType(step: Step): {
  type: "tool" | "code" | "sleep" | "invalid";
  action: ToolCallAction | CodeAction | SleepAction;
} {
  const isToolAction = ToolCallActionSchema.safeParse(step.action).success;
  const isCodeAction = CodeActionSchema.safeParse(step.action).success;
  const isSleepAction = SleepActionSchema.safeParse(step.action).success;
  if (isToolAction)
    return { type: "tool", action: step.action as ToolCallAction };
  if (isCodeAction) return { type: "code", action: step.action as CodeAction };
  if (isSleepAction)
    return { type: "sleep", action: step.action as SleepAction };
  throw new Error(`Unknown step type for step: ${step.name}`);
}
