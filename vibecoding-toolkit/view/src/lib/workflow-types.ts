/**
 * Workflow Types
 *
 * Shared type definitions for workflow management UI.
 * Mirrors server-side schemas from collections/workflow.ts
 */

import {
  CodeAction,
  Step,
  StepAction,
  ToolCallAction,
  WaitForSignalAction,
  Workflow,
} from "@decocms/bindings/workflow";
import { SleepAction } from "server/workflow/schema";

/** A phase is an array of steps that run in parallel */
export type Phase = Step[];

// ============================================================================
// UI State Types
// ============================================================================

export interface StepEditorState {
  isEditing: boolean;
  isDirty: boolean;
  editedStep: Step | null;
  originalStep: Step | null;
  errors: string[];
}

export interface WorkflowEditorState {
  isDirty: boolean;
  selectedPhaseIndex: number | null;
  selectedStepIndex: number | null;
  expandedPhases: Set<number>;
}

// ============================================================================
// Action Type Helpers
// ============================================================================

export function isToolCallAction(action: StepAction): action is ToolCallAction {
  return "toolName" in action && "connectionId" in action;
}

export function isCodeAction(action: StepAction): action is CodeAction {
  return "code" in action;
}

export function isSleepAction(action: StepAction): action is SleepAction {
  return "sleepMs" in action || "sleepUntil" in action;
}

export function isWaitForSignalAction(
  action: StepAction,
): action is WaitForSignalAction {
  return "signalName" in action;
}

export function getStepActionType(
  action: StepAction,
): "tool" | "code" | "sleep" | "signal" {
  if (isToolCallAction(action)) return "tool";
  if (isCodeAction(action)) return "code";
  if (isSleepAction(action)) return "sleep";
  if (isWaitForSignalAction(action)) return "signal";
  throw new Error("Unknown action type");
}

export function getStepActionLabel(action: StepAction): string {
  const type = getStepActionType(action);
  switch (type) {
    case "tool":
      return (action as ToolCallAction).toolName;
    case "code":
      return "Transform";
    case "sleep":
      return "Sleep";
    case "signal":
      return `Wait: ${(action as WaitForSignalAction).signalName}`;
  }
}

export const createDefaultStep = (name: string): Step => ({
  name,
  action: {
    code: "interface Input { items: string[] }\ninterface Output { names: string[] }\nexport default (input: Input): Output => ({ names: input.items.map(i => i.toUpperCase()) })",
  },
});

export const createDefaultPhase = (): Phase => [];

export const createDefaultWorkflow = (): Omit<
  Workflow,
  "id" | "created_at" | "updated_at"
> => ({
  title: "New Workflow",
  description: "",
  steps: [],
  triggers: [],
});
