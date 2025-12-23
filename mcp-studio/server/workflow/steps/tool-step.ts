/**
 * Tool Step Executor
 *
 * Executes MCP tool calls via connection proxy.
 */

import { proxyConnectionForId } from "@decocms/runtime";
import { createMCPFetchStub } from "@decocms/bindings/client";
import { ToolCallActionSchema } from "@decocms/bindings/workflow";
import type { Step, StepResult } from "../../types/step-types.ts";
import type { ExecutionContext } from "../context.ts";

export async function executeToolStep(
  ctx: ExecutionContext,
  step: Step,
  input: Record<string, unknown>,
): Promise<StepResult> {
  const startedAt = Date.now();

  try {
    const parsed = ToolCallActionSchema.safeParse(step.action);
    if (!parsed.success) {
      throw new Error("Tool step missing tool configuration");
    }

    const { connectionId, toolName } = parsed.data;

    const mcpConnection = proxyConnectionForId(connectionId, {
      token: ctx.token,
      meshUrl: ctx.meshUrl,
    });

    const client = createMCPFetchStub({ connection: mcpConnection });

    const toolFn = (
      client as Record<
        string,
        (args: Record<string, unknown>) => Promise<unknown>
      >
    )[toolName];

    if (!toolFn) {
      throw new Error(
        `Tool ${toolName} not found on connection ${connectionId}`,
      );
    }

    await ctx.scheduleRetry(step.config?.timeoutMs ?? 30000);

    const result = await toolFn(input);

    return {
      output: result,
      startedAt,
      completedAt: Date.now(),
      stepId: step.name,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      startedAt,
      stepId: step.name,
    };
  }
}
