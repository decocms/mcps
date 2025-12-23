/**
 * Step Skip Logic
 *
 * Determines whether a step should be skipped based on conditions.
 */

import type { Step } from "../types/step-types.ts";
import type { Condition, RefContext } from "./utils/ref-resolver.ts";
import { evaluateCondition } from "./utils/ref-resolver.ts";

export interface SkipResult {
  skip: boolean;
  reason?: string;
}

/**
 * Check if a step should be skipped based on its condition or branch membership.
 *
 * A step is skipped if:
 * 1. It has an "if" condition that evaluates to false
 * 2. It belongs to a branch whose root was skipped
 */
export function shouldSkipStep(
  step: Step,
  ctx: RefContext,
  skippedBranchRoots: Set<string>,
  branchMembership: Map<string, string | null>,
): SkipResult {
  // Check if this step belongs to a skipped branch
  const branchRoot = branchMembership.get(step.name);
  if (branchRoot && skippedBranchRoots.has(branchRoot)) {
    return {
      skip: true,
      reason: `Branch root '${branchRoot}' condition was not satisfied`,
    };
  }

  // Check if this step has its own condition
  const condition = step.if;

  if (condition) {
    const result = evaluateCondition(condition, ctx);

    if (result.error) {
      console.warn(
        `[WORKFLOW] Condition evaluation error for step '${step.name}': ${result.error}`,
      );
      // On error, don't skip - let the step try to execute
      return { skip: false };
    }

    if (!result.satisfied) {
      return {
        skip: true,
        reason: `Condition not satisfied: ${condition.ref} ${condition.operator || "="} ${JSON.stringify(condition.value)} (was: ${JSON.stringify(result.leftValue)})`,
      };
    }
  }

  return { skip: false };
}
