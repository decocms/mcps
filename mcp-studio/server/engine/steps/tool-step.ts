/**
 * Tool Step Executor
 *
 * Executes MCP tool calls via connection proxy.
 */

import { proxyConnectionForId } from "@decocms/runtime";
import { createMCPFetchStub } from "@decocms/bindings/client";
import { ToolCallActionSchema } from "@decocms/bindings/workflow";
import type { Step, StepResult } from "../../types/step.ts";
import type { ExecutionContext } from "../context.ts";
import { executeCode } from "./code-step.ts";

export async function executeToolStep(
  ctx: ExecutionContext,
  step: Step,
  input: Record<string, unknown>,
): Promise<StepResult> {
  const startedAt = Date.now();

  const parsed = ToolCallActionSchema.safeParse(step.action);
  if (!parsed.success) {
    throw new Error("Tool step missing tool configuration");
  }

  const { connectionId, toolName, transformCode } = parsed.data;
  const mcpConnection = proxyConnectionForId(connectionId, {
    token: ctx.token,
    meshUrl: ctx.meshUrl.replace("/mcp/", "/mcp"),
  });

  const client = createMCPFetchStub({ connection: mcpConnection });

  const toolFn = (
    client as Record<
      string,
      (args: Record<string, unknown>) => Promise<unknown>
    >
  )[toolName];

  if (!toolFn) {
    throw new Error(`Tool ${toolName} not found on connection ${connectionId}`);
  }

  const timeoutMs = step.config?.timeoutMs ?? 30000;

  const result = await Promise.race([
    toolFn(input),
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(new Error(`Tool ${toolName} timed out after ${timeoutMs}ms`)),
        timeoutMs,
      ),
    ),
  ]);

  if (step.outputSchema) {
    // return only fields that are in the output schema
    const outputSchemaProperties = step.outputSchema.properties as Record<
      string,
      unknown
    >;
    const output = outputSchemaProperties
      ? Object.fromEntries(
          Object.entries(result as Record<string, unknown>).filter(
            ([key]) => key in outputSchemaProperties,
          ),
        )
      : (result as Record<string, unknown>);

    if (transformCode) {
      const transformResult = await executeCode(
        transformCode,
        output,
        step.name,
      );
      return transformResult;
    }
  }

  return {
    output: result,
    startedAt,
    completedAt: Date.now(),
    stepId: step.name,
  };
}
