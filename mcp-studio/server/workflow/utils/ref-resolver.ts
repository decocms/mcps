/**
 * @ref Resolution for Workflow v3
 *
 * Resolves references in step inputs:
 * - @stepName.path - Output from previous step
 * - @input.path - Workflow input
 * - @item - Current item in forEach loop
 * - @index - Current index in forEach loop
 *
 * @see docs/WORKFLOW_SCHEMA_DESIGN.md
 */

/**
 * Context for @ref resolution
 */
export interface RefContext {
  /** Outputs from completed steps: Map<stepName, output> */
  stepOutputs: Map<string, unknown>;
  /** Workflow input data */
  workflowInput: Record<string, unknown>;
  /** Current item in forEach loop (if applicable) */
  item?: unknown;
  /** Current index in forEach loop (if applicable) */
  index?: number;
}

/**
 * Resolution result for a single @ref
 */
export interface RefResolution {
  value: unknown;
  error?: string;
}

/**
 * Check if a value is an @ref string
 */
export function isAtRef(value: unknown): value is `@${string}` {
  return typeof value === "string" && value.startsWith("@");
}

/**
 * Parse an @ref string into its components
 */
export function parseAtRef(ref: `@${string}`): {
  type: "step" | "input" | "item";
  stepName?: string;
  groupId?: string;
  path?: string;
} {
  const refStr = ref.substring(1); // Remove @ prefix

  // ForEach item reference: @item or @item.path
  if (refStr === "item" || refStr.startsWith("item.")) {
    const path = refStr.length > 4 ? refStr.substring(5) : ""; // Remove 'item.' or 'item'
    return { type: "item", path };
  }

  // Input reference: @input.path.to.value
  if (refStr.startsWith("input")) {
    const path = refStr.length > 5 ? refStr.substring(6) : ""; // Remove 'input.' or 'input'
    return { type: "input", path };
  }

  // Step output reference: @stepName.path
  const parts = refStr.split(".");
  const stepName = parts[0];
  const path = parts.slice(1).join(".");

  return {
    type: "step",
    stepName,
    path,
  };
}

/**
 * Get a value from an object by path
 */
export function getValueByPath(obj: unknown, path: string): unknown {
  if (!path) return obj;

  const keys = path.split(".");
  let current = obj;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];

    if (current === null || current === undefined) {
      // Better error context: show which part of the path failed
      const traversedPath = keys.slice(0, i).join(".");
      console.warn(
        `[REF] Null/undefined at path "${traversedPath}" while accessing "${key}"`,
      );
      return undefined;
    }

    if (typeof current === "object" && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[key];
    } else if (Array.isArray(current)) {
      const index = parseInt(key, 10);
      current = isNaN(index) ? undefined : current[index];
    } else {
      // Trying to access property on primitive
      const traversedPath = keys.slice(0, i).join(".");
      console.warn(
        `[REF] Cannot access "${key}" on primitive value at "${traversedPath}"`,
      );
      return undefined;
    }
  }

  return current;
}

/**
 * Resolve a single @ref
 */
export function resolveRef(ref: `@${string}`, ctx: RefContext): RefResolution {
  try {
    const parsed = parseAtRef(ref);

    switch (parsed.type) {
      case "input": {
        const value = getValueByPath(ctx.workflowInput, parsed.path || "");
        if (value === undefined) {
          return {
            value: undefined,
            error: `Input path not found: @input.${parsed.path}`,
          };
        }
        return { value };
      }

      case "step": {
        const stepOutput = ctx.stepOutputs.get(parsed.stepName || "");
        if (stepOutput === undefined) {
          return {
            value: undefined,
            error: `Step not found or not completed: ${parsed.stepName}`,
          };
        }
        const value = getValueByPath(stepOutput, parsed.path || "");
        if (value === undefined) {
          return {
            value: undefined,
            error: `Path not found in step output: @${parsed.stepName}.${parsed.path}`,
          };
        }
        return { value };
      }

      case "item": {
        if (ctx.item === undefined) {
          return {
            value: undefined,
            error: `@item used outside of forEach context`,
          };
        }
        const value = getValueByPath(ctx.item, parsed.path || "");
        return { value };
      }

      default:
        return { value: undefined, error: `Unknown reference type: ${ref}` };
    }
  } catch (error) {
    return {
      value: undefined,
      error: `Failed to resolve ${ref}: ${String(error)}`,
    };
  }
}

/**
 * Resolution result with errors
 */
export interface ResolveResult {
  resolved: unknown;
  errors?: Array<{ ref: string; error: string }>;
}

/**
 * Regex to match @refs in strings for interpolation
 */
const AT_REF_PATTERN =
  /@([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/g;

/**
 * Regex to match a COMPLETE @ref (entire string is one reference)
 */
const SINGLE_AT_REF_PATTERN =
  /^@([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)$/;

/**
 * Check if a value is a COMPLETE @ref string (the entire value is one reference)
 */
function isSingleAtRef(value: unknown): value is `@${string}` {
  return typeof value === "string" && SINGLE_AT_REF_PATTERN.test(value);
}

/**
 * Resolve all @refs in an input object
 *
 * Handles:
 * - Direct @ref values (entire value is a reference)
 * - Interpolated @refs in strings
 * - Nested objects and arrays
 */
export function resolveAllRefs(input: unknown, ctx: RefContext): ResolveResult {
  const errors: Array<{ ref: string; error: string }> = [];
  function resolveValue(value: unknown): unknown {
    // If it's a string that IS an @ref (entire value is ONE reference)
    if (isSingleAtRef(value)) {
      const result = resolveRef(value, ctx);
      if (result.error) {
        errors.push({ ref: value, error: result.error });
      }
      return result.value;
    }

    // If it's a string that CONTAINS @refs, interpolate them
    if (typeof value === "string" && value.includes("@")) {
      const interpolated = value.replace(AT_REF_PATTERN, (match) => {
        if (isAtRef(match as `@${string}`)) {
          const result = resolveRef(match as `@${string}`, ctx);
          if (result.error) {
            errors.push({ ref: match, error: result.error });
            return match; // Keep original if resolution fails
          }
          // Fix: JSON.stringify objects instead of String()
          const val = result.value;
          if (val === null || val === undefined) return "";
          if (typeof val === "object") return JSON.stringify(val);
          return String(val);
        }
        return match;
      });
      return interpolated;
    }

    // If it's an array, resolve each element
    if (Array.isArray(value)) {
      return value.map((v) => {
        const resolved = resolveValue(v);
        return resolved;
      });
    }

    // If it's an object, resolve each property
    if (value !== null && typeof value === "object") {
      const resolvedObj: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        resolvedObj[key] = resolveValue(val);
      }
      return resolvedObj;
    }

    // Primitive value, return as-is
    return value;
  }

  const resolved = resolveValue(input);
  return { resolved, errors: errors.length > 0 ? errors : undefined };
}

/**
 * Get all @refs used in an input object
 */
export function extractRefs(input: unknown): string[] {
  const refs: string[] = [];

  function extract(value: unknown): void {
    if (isAtRef(value)) {
      refs.push(value);
      return;
    }

    if (typeof value === "string" && value.includes("@")) {
      const matches = value.match(AT_REF_PATTERN);
      if (matches) {
        refs.push(...matches);
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(extract);
      return;
    }

    if (value !== null && typeof value === "object") {
      Object.values(value).forEach(extract);
    }
  }

  extract(input);
  return refs;
}

// ============================================
// Condition Evaluation
// ============================================

/**
 * Condition structure for conditional step execution
 */
export interface Condition {
  ref: string;
  operator?: "=" | "!=" | ">" | ">=" | "<" | "<=";
  value?: unknown;
}

/**
 * Result of evaluating a condition
 */
export interface ConditionResult {
  /** Whether the condition evaluated to true */
  satisfied: boolean;
  /** The resolved left-hand side value */
  leftValue: unknown;
  /** The resolved right-hand side value */
  rightValue: unknown;
  /** Error message if evaluation failed */
  error?: string;
}

/**
 * Evaluate a condition against the current context.
 *
 * @param condition - The condition to evaluate
 * @param ctx - The current ref context
 * @returns ConditionResult with satisfied boolean and resolved values
 */
export function evaluateCondition(
  condition: Condition,
  ctx: RefContext,
): ConditionResult {
  // Resolve the left-hand side (@ref)
  const leftResolution = isAtRef(condition.ref)
    ? resolveRef(condition.ref as `@${string}`, ctx)
    : { value: condition.ref };

  if (leftResolution.error) {
    return {
      satisfied: false,
      leftValue: undefined,
      rightValue: undefined,
      error: `Failed to resolve condition ref: ${leftResolution.error}`,
    };
  }

  // Resolve the right-hand side (value - can be literal or @ref)
  let rightValue: unknown = condition.value;
  if (typeof condition.value === "string" && isAtRef(condition.value)) {
    const rightResolution = resolveRef(condition.value as `@${string}`, ctx);
    if (rightResolution.error) {
      return {
        satisfied: false,
        leftValue: leftResolution.value,
        rightValue: undefined,
        error: `Failed to resolve condition value: ${rightResolution.error}`,
      };
    }
    rightValue = rightResolution.value;
  }

  const leftValue = leftResolution.value;
  const operator = condition.operator || "=";

  // Perform comparison
  const satisfied = compareValues(leftValue, operator, rightValue);

  return {
    satisfied,
    leftValue,
    rightValue,
  };
}

/**
 * Compare two values using the specified operator
 */
function compareValues(
  left: unknown,
  operator: "=" | "!=" | ">" | ">=" | "<" | "<=",
  right: unknown,
): boolean {
  // For equality operators, use deep equality for objects
  if (operator === "=") {
    return deepEqual(left, right);
  }
  if (operator === "!=") {
    return !deepEqual(left, right);
  }

  // For comparison operators, convert to numbers if possible
  const leftNum = typeof left === "number" ? left : Number(left);
  const rightNum = typeof right === "number" ? right : Number(right);

  // If either side isn't a valid number, fall back to string comparison
  if (isNaN(leftNum) || isNaN(rightNum)) {
    const leftStr = String(left);
    const rightStr = String(right);
    switch (operator) {
      case ">":
        return leftStr > rightStr;
      case ">=":
        return leftStr >= rightStr;
      case "<":
        return leftStr < rightStr;
      case "<=":
        return leftStr <= rightStr;
    }
  }

  switch (operator) {
    case ">":
      return leftNum > rightNum;
    case ">=":
      return leftNum >= rightNum;
    case "<":
      return leftNum < rightNum;
    case "<=":
      return leftNum <= rightNum;
    default:
      return false;
  }
}

/**
 * Deep equality comparison for objects/arrays/primitives
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;

  if (typeof a === "object") {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((val, i) => deepEqual(val, b[i]));
    }

    if (Array.isArray(a) !== Array.isArray(b)) return false;

    const keysA = Object.keys(a as object);
    const keysB = Object.keys(b as object);
    if (keysA.length !== keysB.length) return false;

    return keysA.every((key) =>
      deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
    );
  }

  return false;
}
