/**
 * Workflow Types
 *
 * Shared type definitions for workflow management UI.
 * Mirrors server-side schemas from collections/workflow.ts
 */

// ============================================================================
// Step Action Types
// ============================================================================

export interface ToolCallAction {
  connectionId: string;
  toolName: string;
}

export interface CodeAction {
  code: string;
}

export interface SleepAction {
  sleepMs?: number;
  sleepUntil?: string;
}

export interface WaitForSignalAction {
  signalName: string;
  timeoutMs?: number;
  description?: string;
}

export type StepAction =
  | ToolCallAction
  | CodeAction
  | SleepAction
  | WaitForSignalAction;

// ============================================================================
// Step Types
// ============================================================================

export interface RetryConfig {
  maxAttempts: number;
  backoffMs: number;
}

export interface Step {
  name: string;
  action: StepAction;
  input?: Record<string, unknown>;
  retry?: RetryConfig;
}

/** A phase is an array of steps that run in parallel */
export type Phase = Step[];

// ============================================================================
// Trigger Types
// ============================================================================

export interface Trigger {
  workflowId: string;
  input: Record<string, unknown>;
}

// ============================================================================
// Workflow Types
// ============================================================================

export interface Workflow {
  id: string;
  title: string;
  description?: string;
  steps: Phase[];
  triggers?: Trigger[];
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

// ============================================================================
// Execution Types
// ============================================================================

export type ExecutionStatus = "pending" | "running" | "completed" | "cancelled";

export interface WorkflowExecution {
  id: string;
  workflow_id: string;
  status: ExecutionStatus;
  input?: Record<string, unknown>;
  output?: unknown;
  parent_execution_id?: string;
  created_at: number;
  updated_at: number;
  started_at_epoch_ms?: number;
  completed_at_epoch_ms?: number;
  locked_until_epoch_ms?: number;
  lock_id?: string;
  retry_count: number;
  max_retries: number;
  error?: string;
}

export interface ExecutionStepResult {
  execution_id: string;
  step_id: string;
  input?: Record<string, unknown> | null;
  output?: unknown;
  error?: string | null;
  started_at_epoch_ms?: number | null;
  completed_at_epoch_ms?: number | null;
}

// ============================================================================
// Event Types
// ============================================================================

export type EventType =
  | "signal"
  | "timer"
  | "message"
  | "output"
  | "step_started"
  | "step_completed"
  | "workflow_started"
  | "workflow_completed";

export interface WorkflowEvent {
  id: string;
  execution_id: string;
  type: EventType;
  name?: string;
  payload?: unknown;
  created_at: number;
  visible_at?: number;
  consumed_at?: number;
  source_execution_id?: string;
}

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

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  backoffMs: 1000,
};

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
