/**
 * Workflow Execution Context
 *
 * Encapsulates env and executionId to avoid prop drilling.
 * Provides convenient access to common operations.
 */

import type { Env } from "../types/env.ts";
import {
  getExecution,
  getStepResults,
  createStepResult,
  updateStepResult,
} from "../db/queries/executions.ts";
import { WorkflowCancelledError } from "../utils/errors.ts";

export class ExecutionContext {
  constructor(
    readonly env: Env,
    readonly executionId: string,
    readonly gatewayId: string,
  ) {}

  get token(): string {
    return this.env.MESH_REQUEST_CONTEXT?.token || "";
  }

  get meshUrl(): string {
    return this.env.MESH_REQUEST_CONTEXT?.meshUrl ?? "";
  }

  async checkCancelled(): Promise<void> {
    const execution = await getExecution(this.env, this.executionId);
    if (execution?.status === "cancelled") {
      throw new WorkflowCancelledError(this.executionId);
    }
  }

  async getStepResults() {
    return getStepResults(this.env, this.executionId);
  }

  async claimStep(stepId: string): Promise<void> {
    await createStepResult(this.env, {
      execution_id: this.executionId,
      step_id: stepId,
    });
  }

  async completeStep(
    stepId: string,
    output?: unknown,
    error?: string,
  ): Promise<void> {
    await updateStepResult(this.env, this.executionId, stepId, {
      output,
      error,
      completed_at_epoch_ms: Date.now(),
    });
  }

  async updateStep(
    stepId: string,
    data: {
      output?: unknown;
      error?: string;
      started_at_epoch_ms?: number;
      completed_at_epoch_ms?: number;
    },
  ) {
    return updateStepResult(this.env, this.executionId, stepId, data);
  }
}
