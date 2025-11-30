import {
  SleepActionSchema,
  CodeActionSchema,
  ToolCallActionSchema,
  WaitForSignalActionSchema,
  type Step,
} from "../collections/workflow.ts";
import { z } from "zod";

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

export type ToolCallAction = z.infer<typeof ToolCallActionSchema>;
export type CodeAction = z.infer<typeof CodeActionSchema>;
export type SleepAction = z.infer<typeof SleepActionSchema>;
export type WaitForSignalAction = z.infer<typeof WaitForSignalActionSchema>;

export function getStepType(step: Step): {
  type: "tool" | "code" | "sleep" | "waitForSignal";
  action: ToolCallAction | CodeAction | SleepAction | WaitForSignalAction;
} {
  const isToolAction = ToolCallActionSchema.safeParse(step.action).success;
  const isCodeAction = CodeActionSchema.safeParse(step.action).success;
  const isSleepAction = SleepActionSchema.safeParse(step.action).success;
  const isWaitForSignalAction = WaitForSignalActionSchema.safeParse(
    step.action,
  ).success;

  if (isToolAction)
    return { type: "tool", action: step.action as ToolCallAction };
  if (isCodeAction) return { type: "code", action: step.action as CodeAction };
  if (isSleepAction)
    return { type: "sleep", action: step.action as SleepAction };
  if (isWaitForSignalAction)
    return {
      type: "waitForSignal",
      action: step.action as WaitForSignalAction,
    };
  throw new Error(`Unknown step type for step: ${step.name}`);
}
