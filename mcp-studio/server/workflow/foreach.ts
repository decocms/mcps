/**
 * ForEach Loop Execution
 *
 * Handles forEach loop execution for steps.
 */

import type { Step, StepResult } from "../types/step-types.ts";
import type { RefContext } from "./utils/ref-resolver.ts";
import { resolveRef, resolveAllRefs } from "./utils/ref-resolver.ts";
import type { StepExecutor } from "./steps/step-executor.ts";

/**
 * Parse forEach items from a resolved value.
 */
export function parseForEachItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;

  if (typeof value === "object" && value !== null && "content" in value) {
    const text = (value as { content: { text: string }[] }).content?.[0]?.text;
    if (text) {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
    }
  }

  throw new Error(`forEach items must resolve to an array`);
}

export interface ForEachResult {
  outputs: unknown[];
  stepIds: string[];
}

/**
 * Execute a step in a forEach loop.
 */
export async function executeForEach(
  step: Step,
  ctx: RefContext,
  stepExecutor: StepExecutor,
  _executionId: string,
): Promise<ForEachResult> {
  const config = step.config!.loop!.for!;
  const items = parseForEachItems(
    resolveRef(config.items as `@${string}`, ctx).value,
  );
  const limit = step.config!.loop!.limit ?? items.length;

  const results: StepResult[] = [];

  for (let i = 0; i < limit; i++) {
    const itemCtx: RefContext = { ...ctx, item: items[i], index: i };
    const input = resolveAllRefs(step.input, itemCtx).resolved as Record<
      string,
      unknown
    >;

    const result = await stepExecutor.executeStep(
      { ...step, name: `${step.name}[${i}]` },
      input,
      { started_at_epoch_ms: Date.now() },
    );

    results.push(result);
  }

  return {
    outputs: results.map((r) => r.output),
    stepIds: results.map((r) => r.stepId),
  };
}
