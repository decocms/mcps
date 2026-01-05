/**
 * Workflow Types
 *
 * Compatible with mcp-studio's workflow schema from @decocms/bindings/workflow.
 * Extended with LLM action type for agent loops.
 *
 * NOTE: Using simple types instead of complex Zod schemas to avoid TS memory issues.
 */

// ============================================================================
// Step Actions (plain types - no Zod to avoid TS memory explosion)
// ============================================================================

export interface ToolCallAction {
  type: "tool";
  toolName: string;
  connectionId?: string;
  transformCode?: string;
}

export interface CodeAction {
  type: "code";
  code: string;
}

export interface LLMAction {
  type: "llm";
  prompt: string;
  model?: "fast" | "smart";
  systemPrompt?: string;
  tools?: "all" | "discover" | "none" | string[];
  maxIterations?: number;
}

export interface TemplateAction {
  type: "template";
  template: string;
}

export type StepAction =
  | ToolCallAction
  | CodeAction
  | LLMAction
  | TemplateAction;

// ============================================================================
// Step Configuration
// ============================================================================

export interface StepConfig {
  maxAttempts?: number;
  backoffMs?: number;
  timeoutMs?: number;
  continueOnError?: boolean;
  /**
   * Skip this step if expression evaluates to true.
   * Supports:
   * - "empty:@stepName.field" - skip if field is empty array or undefined
   * - "equals:@stepName.a,@stepName.b" - skip if a equals b
   */
  skipIf?: string;
}

// ============================================================================
// Step
// ============================================================================

export interface Step {
  name: string;
  description?: string;
  action: StepAction;
  input?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  config?: StepConfig;
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

// ============================================================================
// Reference Resolution Utilities
// ============================================================================

/**
 * Extract all @ref references from a value recursively.
 * Finds patterns like @stepName or @stepName.field
 */
export function getAllRefs(input: unknown): string[] {
  const refs: string[] = [];

  function traverse(value: unknown) {
    if (typeof value === "string") {
      const matches = value.match(/@(\w+)/g);
      if (matches) {
        refs.push(...matches.map((m) => m.substring(1)));
      }
    } else if (Array.isArray(value)) {
      value.forEach(traverse);
    } else if (typeof value === "object" && value !== null) {
      Object.values(value).forEach(traverse);
    }
  }

  traverse(input);
  return [...new Set(refs)].sort();
}

/**
 * Get the dependencies of a step (other steps it references)
 */
export function getStepDependencies(
  step: Step,
  allStepNames: Set<string>,
): string[] {
  const deps: string[] = [];

  function traverse(value: unknown) {
    if (typeof value === "string") {
      const matches = value.match(/@(\w+)/g);
      if (matches) {
        for (const match of matches) {
          const refName = match.substring(1);
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

  // Also check action inputs
  if ("prompt" in step.action) {
    traverse(step.action.prompt);
  }
  if ("tools" in step.action && Array.isArray(step.action.tools)) {
    traverse(step.action.tools);
  }

  return [...new Set(deps)];
}

/**
 * Resolve @ref references in a value
 */
export function resolveRefs(
  input: unknown,
  context: {
    input: Record<string, unknown>;
    steps: Record<string, unknown>;
  },
): unknown {
  if (typeof input === "string") {
    // Check if entire string is a reference
    const fullMatch = input.match(/^@(\w+)(?:\.(.+))?$/);
    if (fullMatch) {
      const [, refName, path] = fullMatch;
      let value: unknown;

      if (refName === "input") {
        value = context.input;
      } else if (context.steps[refName] !== undefined) {
        value = context.steps[refName];
      } else {
        return input; // Unresolved reference
      }

      if (path && typeof value === "object" && value !== null) {
        return getNestedValue(value as Record<string, unknown>, path);
      }
      return value;
    }

    // Replace embedded references in string
    return input.replace(/@(\w+)(?:\.([.\w]+))?/g, (match, refName, path) => {
      let value: unknown;

      if (refName === "input") {
        value = context.input;
      } else if (context.steps[refName] !== undefined) {
        value = context.steps[refName];
      } else {
        return match;
      }

      if (path && typeof value === "object" && value !== null) {
        value = getNestedValue(value as Record<string, unknown>, path);
      }

      if (typeof value === "string") return value;
      if (value === undefined || value === null) return "";
      return JSON.stringify(value);
    });
  }

  if (Array.isArray(input)) {
    return input.map((item) => resolveRefs(item, context));
  }

  if (typeof input === "object" && input !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      result[key] = resolveRefs(value, context);
    }
    return result;
  }

  return input;
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Compute topological levels for all steps
 */
export function computeStepLevels(steps: Step[]): Map<string, number> {
  const stepNames = new Set(steps.map((s) => s.name));
  const levels = new Map<string, number>();
  const depsMap = new Map<string, string[]>();

  for (const step of steps) {
    depsMap.set(step.name, getStepDependencies(step, stepNames));
  }

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
 * Group steps by execution level for parallel execution
 */
export function groupStepsByLevel(steps: Step[]): Step[][] {
  const levels = computeStepLevels(steps);
  const maxLevel = Math.max(...Array.from(levels.values()), -1);

  const grouped: Step[][] = [];
  for (let level = 0; level <= maxLevel; level++) {
    const stepsAtLevel = steps.filter((s) => levels.get(s.name) === level);
    if (stepsAtLevel.length > 0) {
      grouped.push(stepsAtLevel);
    }
  }

  return grouped;
}
