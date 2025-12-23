import type { Condition, DAGStep } from "@decocms/bindings/workflow";

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

  // Also consider "if" condition as a dependency
  if (step.if) {
    traverse(step.if.ref);
    if (typeof step.if.value === "string") {
      traverse(step.if.value);
    }
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

/**
 * Get all refs from a condition (both ref and value if value is a @ref)
 */
export function getConditionRefs(condition: Condition): string[] {
  const refs: string[] = [];

  // Get ref from the condition's ref field
  const refMatch = condition.ref.match(/@(\w+)/);
  if (refMatch?.[1]) {
    refs.push(refMatch[1]);
  }

  // Get ref from the value if it's a @ref string
  if (typeof condition.value === "string") {
    const valueMatch = condition.value.match(/@(\w+)/);
    if (valueMatch?.[1]) {
      refs.push(valueMatch[1]);
    }
  }

  return [...new Set(refs)];
}

/**
 * Determines which branch a step belongs to.
 * A step belongs to a branch if:
 * 1. It has an "if" condition (it's the branch root)
 * 2. It transitively depends on a step with an "if" condition
 *
 * @param steps - All steps in the workflow
 * @returns Map from step name to branch root step name (or null if not in a branch)
 */
export function computeBranchMembership<T extends DAGStep>(
  steps: T[],
): Map<string, string | null> {
  const stepNames = new Set(steps.map((s) => s.name));
  const stepMap = new Map(steps.map((s) => [s.name, s]));
  const branchMembership = new Map<string, string | null>();

  // Build dependency map
  const dependsOn = new Map<string, Set<string>>();
  for (const step of steps) {
    const deps = new Set<string>();

    // Add input dependencies
    const inputDeps = getStepDependencies(step, stepNames);
    for (const dep of inputDeps) {
      deps.add(dep);
    }

    // Add condition dependencies
    if (step.if) {
      const conditionRefs = getConditionRefs(step.if);
      for (const ref of conditionRefs) {
        if (stepNames.has(ref)) {
          deps.add(ref);
        }
      }
    }

    dependsOn.set(step.name, deps);
  }

  // Find branch root for each step (with memoization)
  function findBranchRoot(
    stepName: string,
    visited: Set<string>,
  ): string | null {
    if (branchMembership.has(stepName)) {
      return branchMembership.get(stepName) ?? null;
    }

    if (visited.has(stepName)) {
      return null; // Cycle detection
    }

    visited.add(stepName);
    const step = stepMap.get(stepName);
    if (!step) return null;

    // If this step has an "if" condition, it's a branch root
    if (step.if) {
      branchMembership.set(stepName, stepName);
      return stepName;
    }

    // Check if any dependency is in a branch
    const deps = dependsOn.get(stepName) || new Set();
    for (const dep of deps) {
      const depBranchRoot = findBranchRoot(dep, new Set(visited));
      if (depBranchRoot) {
        branchMembership.set(stepName, depBranchRoot);
        return depBranchRoot;
      }
    }

    branchMembership.set(stepName, null);
    return null;
  }

  // Compute branch membership for all steps
  for (const step of steps) {
    findBranchRoot(step.name, new Set());
  }

  return branchMembership;
}
