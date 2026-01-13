/**
 * Workflow Types
 *
 * Minimal type definitions for workflow validation.
 * Actual workflow execution is handled by MCP Studio's orchestrator.
 */

// ============================================================================
// Step
// ============================================================================

export interface Step {
  name: string;
  description?: string;
  action: {
    type: string;
    [key: string]: unknown;
  };
  input?: Record<string, unknown>;
  config?: {
    maxAttempts?: number;
    timeoutMs?: number;
    continueOnError?: boolean;
  };
}

// ============================================================================
// Workflow
// ============================================================================

export interface Workflow {
  id: string;
  title: string;
  description?: string;
  steps: Step[];
  defaultInput?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}
