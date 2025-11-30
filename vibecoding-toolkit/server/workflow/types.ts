/**
 * Workflow Executor Types
 *
 * Type definitions for the workflow execution system.
 */

/** Result of executing a single step */
export interface StepExecutionResult {
  output?: unknown;
  error?: string;
  startedAt: number;
  completedAt?: number;
  /**
   * If true, this output should NOT be used as workflow output.
   * Large outputs (streams, LLM responses) should stay in step_results only.
   */
  excludeFromWorkflowOutput?: boolean;
}

/**
 * Result of executing a complete workflow
 *
 * Uses discriminated union for clear, type-safe result handling.
 * The queue handler interprets these results and schedules accordingly.
 */
export type WorkflowExecutionResult =
  | WorkflowCompletedResult
  | WorkflowFailedResult
  | WorkflowSleepingResult
  | WorkflowWaitingForSignalResult
  | WorkflowCancelledResult;

/** Workflow completed successfully */
export interface WorkflowCompletedResult {
  status: "completed";
  output?: unknown;
  triggerResults?: TriggerResult[];
}

/** Workflow failed with an error */
export interface WorkflowFailedResult {
  status: "failed";
  error: string;
  /** Whether this failure is retryable */
  retryable: boolean;
  /** Suggested retry delay in seconds (for exponential backoff) */
  retryDelaySeconds?: number;
}

/** Workflow is sleeping and needs to be woken at a specific time */
export interface WorkflowSleepingResult {
  status: "sleeping";
  /** When to wake the workflow */
  wakeAtEpochMs: number;
  /** Which step is sleeping */
  stepName: string;
}

/** Workflow is waiting for an external signal */
export interface WorkflowWaitingForSignalResult {
  status: "waiting_for_signal";
  /** Name of the signal being waited for */
  signalName: string;
  /** Which step is waiting */
  stepName: string;
  /** Optional timeout timestamp */
  timeoutAtEpochMs?: number;
}

/** Workflow was cancelled */
export interface WorkflowCancelledResult {
  status: "cancelled";
}

/** Result of firing a trigger */
export interface TriggerResult {
  triggerId: string;
  status: "triggered" | "skipped" | "failed";
  executionIds?: string[];
  error?: string;
}

/** Configuration for workflow executor */
export interface ExecutorConfig {
  stepTimeoutMs?: number;
  lockDurationMs?: number;
  verbose?: boolean;
}

/** Internal result from tool step execution */
export interface ToolStepResult {
  status: "completed" | "failed";
  output?: unknown;
  error?: string;
  startedAt: number;
  completedAt?: number;
  /** If true, output is large and should be excluded from workflow output */
  excludeFromWorkflowOutput?: boolean;
}

/** Internal result from sleep step execution */
export interface SleepStepResult {
  slept: boolean;
  sleepDurationMs: number | undefined;
}

/** Internal result from waitForSignal step execution */
export interface WaitForSignalStepResult {
  signalName: string;
  payload: unknown;
  receivedAt: number;
  waitDurationMs: number;
}

// ============================================================================
// Streaming Types
// ============================================================================

/** Result when a step returns a stream */
export interface StreamingStepResult {
  /** The stream to pass to the client */
  stream: ReadableStream<Uint8Array>;

  /** Promise that resolves when buffering + checkpoint completes */
  onComplete: Promise<{
    output: string;
    completedAt: number;
  }>;

  /** Step metadata */
  stepName: string;
  startedAt: number;
}

/** Check if result is streaming */
export function isStreamingResult(
  result: StepExecutionResult | StreamingStepResult,
): result is StreamingStepResult {
  return "stream" in result && result.stream instanceof ReadableStream;
}
