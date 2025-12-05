/**
 * Control Flow for Workflows
 *
 * Handles forEach loops and parallel execution modes:
 * - forEach: Iterate over arrays with sequential/parallel/race/allSettled modes
 * - parallel groups: Explicit step grouping with execution modes
 */

import type { Step } from "@decocms/bindings/workflow";
import {
  extractRefs,
  parseAtRef,
  resolveRef,
  type RefContext,
} from "./ref-resolver.ts";

// ============================================================================
// Types
// ============================================================================

export type ParallelMode = "all" | "race" | "allSettled";
export type ForEachMode = "sequential" | "parallel" | "race" | "allSettled";

export interface ForEachConfig {
  /** @ref to array to iterate over, e.g. "@fetchData.output.items" */
  items: string;
  /** Variable name for current item, default "item" (accessible as @item) */
  as?: string;
  /** Execution mode for iterations */
  mode?: ForEachMode;
  /** Max concurrent executions for parallel mode */
  maxConcurrency?: number;
}

export interface ParallelGroupConfig {
  /** Group ID - steps with same groupId run together */
  group: string;
  /** How to handle the parallel group */
  mode?: ParallelMode;
}

export interface StepConfig {
  forEach?: ForEachConfig;
  parallel?: ParallelGroupConfig;
}

export interface ExpandedStep {
  /** The original or cloned step */
  step: Step;
  /** forEach context if this is an iteration */
  iteration?: {
    item: unknown;
    index: number;
    total: number;
  };
  /** Parallel group info */
  parallelGroup?: {
    groupId: string;
    mode: ParallelMode;
  };
}

export interface ForEachResult<T> {
  mode: ForEachMode;
  results: Array<{
    index: number;
    item: unknown;
    status: "fulfilled" | "rejected";
    value?: T;
    reason?: string;
  }>;
  /** For race mode, which iteration won */
  winner?: number;
}

// ============================================================================
// Step Config Parsing
// ============================================================================

/**
 * Parse step config from a step. The config can be in step.config or we detect
 * forEach patterns from the step definition.
 */
export function parseStepConfig(step: Step): StepConfig | undefined {
  const config = (step as any).config as StepConfig | undefined;
  return config;
}

/**
 * Check if a step has forEach configuration
 */
export function hasForEach(step: Step): boolean {
  const config = parseStepConfig(step);
  return !!config?.forEach?.items;
}

/**
 * Check if a step has parallel group configuration
 */
export function hasParallelGroup(step: Step): boolean {
  const config = parseStepConfig(step);
  return !!config?.parallel?.group;
}

// ============================================================================
// ForEach Expansion
// ============================================================================

/**
 * Expand a step with forEach into multiple step executions.
 * Returns the items to iterate over resolved from the context.
 */
export function resolveForEachItems(
  step: Step,
  ctx: RefContext,
): { items: unknown[]; config: ForEachConfig } | null {
  const config = parseStepConfig(step);
  if (!config?.forEach?.items) return null;

  const itemsRef = config.forEach.items;
  if (!itemsRef.startsWith("@")) {
    console.warn(`[forEach] Invalid items ref: ${itemsRef}, must start with @`);
    return null;
  }

  const { value, error } = resolveRef(itemsRef as `@${string}`, ctx);
  if (error) {
    console.warn(`[forEach] Failed to resolve items ref ${itemsRef}: ${error}`);
    return null;
  }

  if (!Array.isArray(value)) {
    console.warn(`[forEach] Items ref ${itemsRef} did not resolve to an array`);
    return null;
  }

  return { items: value, config: config.forEach };
}

/**
 * Create expanded steps for a forEach iteration
 */
export function expandForEachStep(
  step: Step,
  items: unknown[],
  config: ForEachConfig,
): ExpandedStep[] {
  return items.map((item, index) => ({
    step: {
      ...step,
      // Create unique name for this iteration
      name: `${step.name}[${index}]`,
    },
    iteration: {
      item,
      index,
      total: items.length,
    },
  }));
}

// ============================================================================
// Parallel Group Handling
// ============================================================================

/**
 * Group steps by their parallel group configuration
 */
export function groupStepsByParallelConfig(
  steps: Step[],
): Map<string, { steps: Step[]; mode: ParallelMode }> {
  const groups = new Map<string, { steps: Step[]; mode: ParallelMode }>();

  for (const step of steps) {
    const config = parseStepConfig(step);
    if (config?.parallel?.group) {
      const groupId = config.parallel.group;
      const mode = config.parallel.mode || "all";

      if (!groups.has(groupId)) {
        groups.set(groupId, { steps: [], mode });
      }
      groups.get(groupId)!.steps.push(step);
    }
  }

  return groups;
}

// ============================================================================
// Execution Helpers
// ============================================================================

/**
 * Execute items with a specific parallel mode
 */
export async function executeWithMode<T>(
  items: Array<{ item: unknown; index: number }>,
  executor: (item: unknown, index: number) => Promise<T>,
  mode: ForEachMode | ParallelMode,
  maxConcurrency?: number,
): Promise<ForEachResult<T>> {
  const results: ForEachResult<T>["results"] = [];

  switch (mode) {
    case "sequential": {
      for (const { item, index } of items) {
        try {
          const value = await executor(item, index);
          results.push({ index, item, status: "fulfilled", value });
        } catch (err) {
          results.push({
            index,
            item,
            status: "rejected",
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return { mode, results };
    }

    case "all":
    case "parallel": {
      // Execute all in parallel (with optional concurrency limit)
      if (maxConcurrency && maxConcurrency > 0) {
        // Chunked parallel execution
        for (let i = 0; i < items.length; i += maxConcurrency) {
          const chunk = items.slice(i, i + maxConcurrency);
          const chunkResults = await Promise.all(
            chunk.map(async ({ item, index }) => {
              try {
                const value = await executor(item, index);
                return { index, item, status: "fulfilled" as const, value };
              } catch (err) {
                return {
                  index,
                  item,
                  status: "rejected" as const,
                  reason: err instanceof Error ? err.message : String(err),
                };
              }
            }),
          );
          results.push(...chunkResults);
        }
      } else {
        // All at once
        const allResults = await Promise.all(
          items.map(async ({ item, index }) => {
            try {
              const value = await executor(item, index);
              return { index, item, status: "fulfilled" as const, value };
            } catch (err) {
              return {
                index,
                item,
                status: "rejected" as const,
                reason: err instanceof Error ? err.message : String(err),
              };
            }
          }),
        );
        results.push(...allResults);
      }

      // For "all" mode, throw if any failed
      if (mode === "all") {
        const firstFailure = results.find((r) => r.status === "rejected");
        if (firstFailure) {
          throw new Error(
            `forEach failed at index ${firstFailure.index}: ${firstFailure.reason}`,
          );
        }
      }

      return { mode, results };
    }

    case "race": {
      // Return first to complete successfully
      const promises = items.map(async ({ item, index }) => {
        const value = await executor(item, index);
        return { index, item, status: "fulfilled" as const, value };
      });

      const winner = await Promise.race(promises);
      results.push(winner);

      return { mode, results, winner: winner.index };
    }

    case "allSettled": {
      // Wait for all, regardless of success/failure
      const allResults = await Promise.allSettled(
        items.map(({ item, index }) => executor(item, index)),
      );

      for (let i = 0; i < allResults.length; i++) {
        const result = allResults[i];
        const { item, index } = items[i];
        if (result.status === "fulfilled") {
          results.push({
            index,
            item,
            status: "fulfilled",
            value: result.value,
          });
        } else {
          results.push({
            index,
            item,
            status: "rejected",
            reason:
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason),
          });
        }
      }

      return { mode, results };
    }

    default:
      throw new Error(`Unknown execution mode: ${mode}`);
  }
}

/**
 * Create a RefContext with forEach iteration variables
 */
export function createIterationContext(
  baseCtx: RefContext,
  item: unknown,
  index: number,
): RefContext {
  return {
    ...baseCtx,
    item,
    index,
  };
}
