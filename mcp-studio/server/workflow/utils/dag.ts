import { DAGStep } from "@decocms/bindings/workflow";

/**
 * Extract all @ref references from a value recursively.
 * Finds patterns like @stepName or @stepName.field
 *
 * @param input - Any value that might contain @ref strings
 * @returns Array of unique reference names (without @ prefix)
 */
export function getAllRefs(input: unknown): string[] {
  const refs: string[] = [];

  function traverse(value: unknown) {
    if (typeof value === "string") {
      const matches = value.match(/@(\w+)/g);
      if (matches) {
        refs.push(...matches.map((m) => m.substring(1))); // Remove @ prefix
      }
    } else if (Array.isArray(value)) {
      value.forEach(traverse);
    } else if (typeof value === "object" && value !== null) {
      Object.values(value).forEach(traverse);
    }
  }

  traverse(input);
  return [...new Set(refs)].sort(); // Dedupe and sort for consistent results
}

/**
 * Get the dependencies of a step (other steps it references).
 * Only returns dependencies that are actual step names (filters out built-ins like "item", "index", "input").
 *
 * @param step - The step to analyze
 * @param allStepNames - Set of all step names in the workflow
 * @returns Array of step names this step depends on
 */
export function getStepDependencies(
  step: DAGStep,
  allStepNames: Set<string>,
): string[] {
  const deps: string[] = [];

  function traverse(value: unknown) {
    if (typeof value === "string") {
      // Match @stepName or @stepName.something patterns
      const matches = value.match(/@(\w+)/g);
      if (matches) {
        for (const match of matches) {
          const refName = match.substring(1); // Remove @
          // Only count as dependency if it references another step
          // (not "item", "index", "input" from forEach or workflow input)
          if (allStepNames.has(refName)) {
            deps.push(refName);
          }
        }
      }
    } else if (Array.isArray(value)) {
      value.forEach(traverse);
    } else if (typeof value === "object" && value !== null) {
      Object.values(value).forEach(traverse);
    }
  }

  traverse(step.input);
  if (step.config?.loop?.for?.items) {
    traverse(step.config.loop.for.items);
  }

  return [...new Set(deps)];
}

/**
 * Compute topological levels for all steps.
 * Level 0 = no dependencies on other steps
 * Level N = depends on at least one step at level N-1
 *
 * @param steps - Array of steps to analyze
 * @returns Map from step name to level number
 */
export function computeStepLevels<T extends DAGStep>(
  steps: T[],
): Map<string, number> {
  const stepNames = new Set(steps.map((s) => s.name));
  const levels = new Map<string, number>();

  // Build dependency map
  const depsMap = new Map<string, string[]>();
  for (const step of steps) {
    depsMap.set(step.name, getStepDependencies(step, stepNames));
  }

  // Compute level for each step (with memoization)
  function getLevel(stepName: string, visited: Set<string>): number {
    if (levels.has(stepName)) return levels.get(stepName)!;
    if (visited.has(stepName)) return 0; // Cycle detection

    visited.add(stepName);
    const deps = depsMap.get(stepName) || [];

    if (deps.length === 0) {
      levels.set(stepName, 0);
      return 0;
    }

    const maxDepLevel = Math.max(...deps.map((d) => getLevel(d, visited)));
    const level = maxDepLevel + 1;
    levels.set(stepName, level);
    return level;
  }

  for (const step of steps) {
    getLevel(step.name, new Set());
  }

  return levels;
}

/**
 * Group steps by their execution level.
 * Steps at the same level have no dependencies on each other and can run in parallel.
 *
 * @param steps - Array of steps to group
 * @returns Array of step arrays, where index is the level
 */
export function groupStepsByLevel<T extends DAGStep>(steps: T[]): T[][] {
  const levels = computeStepLevels(steps);
  const maxLevel = Math.max(...Array.from(levels.values()), -1);

  const grouped: T[][] = [];
  for (let level = 0; level <= maxLevel; level++) {
    const stepsAtLevel = steps.filter((s) => levels.get(s.name) === level);
    if (stepsAtLevel.length > 0) {
      grouped.push(stepsAtLevel);
    }
  }

  return grouped;
}

/**
 * Get the dependency signature for a step (for grouping steps with same deps).
 *
 * @param step - The step to get signature for
 * @returns Comma-separated sorted list of dependencies
 */
export function getRefSignature(step: DAGStep): string {
  const inputRefs = getAllRefs(step.input);
  const forEachRefs = step.config?.loop?.for?.items
    ? getAllRefs(step.config.loop.for.items)
    : [];
  const allRefs = [...new Set([...inputRefs, ...forEachRefs])].sort();
  return allRefs.join(",");
}

/**
 * Build a dependency graph for visualization.
 * Returns edges as [fromStep, toStep] pairs.
 *
 * @param steps - Array of steps
 * @returns Array of [source, target] pairs representing edges
 */
export function buildDependencyEdges<T extends DAGStep>(
  steps: T[],
): [string, string][] {
  const stepNames = new Set(steps.map((s) => s.name));
  const edges: [string, string][] = [];

  for (const step of steps) {
    const deps = getStepDependencies(step, stepNames);
    for (const dep of deps) {
      edges.push([dep, step.name]);
    }
  }

  return edges;
}

/**
 * Validate that there are no cycles in the step dependencies.
 *
 * @param steps - Array of steps to validate
 * @returns Object with isValid and optional error message
 */
export function validateNoCycles<T extends DAGStep>(
  steps: T[],
): { isValid: boolean; error?: string } {
  const stepNames = new Set(steps.map((s) => s.name));
  const depsMap = new Map<string, string[]>();

  for (const step of steps) {
    depsMap.set(step.name, getStepDependencies(step, stepNames));
  }

  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function hasCycle(stepName: string, path: string[]): string[] | null {
    if (recursionStack.has(stepName)) {
      return [...path, stepName];
    }
    if (visited.has(stepName)) {
      return null;
    }

    visited.add(stepName);
    recursionStack.add(stepName);

    const deps = depsMap.get(stepName) || [];
    for (const dep of deps) {
      const cycle = hasCycle(dep, [...path, stepName]);
      if (cycle) return cycle;
    }

    recursionStack.delete(stepName);
    return null;
  }

  for (const step of steps) {
    const cycle = hasCycle(step.name, []);
    if (cycle) {
      return {
        isValid: false,
        error: `Circular dependency detected: ${cycle.join(" -> ")}`,
      };
    }
  }

  return { isValid: true };
}
