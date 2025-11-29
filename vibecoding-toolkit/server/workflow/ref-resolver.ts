/**
 * @ref Resolution for Workflow v3
 *
 * Resolves references in step inputs:
 * - @stepName.output.path - Output from previous step
 * - @input.path - Workflow input
 * - @item - Current item in forEach loop
 * - @index - Current index in forEach loop
 * - @output.path - Final workflow output (in triggers)
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
  /** Final workflow output (for trigger resolution) */
  output?: unknown;
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
  type: "step" | "input" | "item" | "index" | "output";
  stepName?: string;
  path?: string;
} {
  const refStr = ref.substring(1); // Remove @ prefix

  // Special refs - @item and @item.path
  if (refStr === "item" || refStr.startsWith("item.")) {
    const path = refStr.startsWith("item.") ? refStr.substring(5) : "";
    return { type: "item", path };
  }
  if (refStr === "index") {
    return { type: "index" };
  }

  // Input reference: @input.path.to.value
  if (refStr.startsWith("input")) {
    const path = refStr.length > 5 ? refStr.substring(6) : ""; // Remove 'input.' or 'input'
    return { type: "input", path };
  }

  // Output reference (for triggers): @output.path.to.value
  if (refStr.startsWith("output")) {
    const path = refStr.length > 6 ? refStr.substring(7) : ""; // Remove 'output.' or 'output'
    return { type: "output", path };
  }

  // Step reference: @stepName.output.path or @stepName.path
  const parts = refStr.split(".");
  const stepName = parts[0];

  // Remove 'output' from path if present (it's implicit)
  let pathParts = parts.slice(1);
  if (pathParts[0] === "output") {
    pathParts = pathParts.slice(1);
  }

  return {
    type: "step",
    stepName,
    path: pathParts.join("."),
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
      case "item": {
        if (ctx.item === undefined) {
          return {
            value: undefined,
            error: "@item used outside of forEach loop",
          };
        }
        // Support @item.path for accessing properties on the current item
        const value = parsed.path
          ? getValueByPath(ctx.item, parsed.path)
          : ctx.item;
        if (value === undefined && parsed.path) {
          return {
            value: undefined,
            error: `Path not found on item: @item.${parsed.path}`,
          };
        }
        return { value };
      }

      case "index": {
        if (ctx.index === undefined) {
          return {
            value: undefined,
            error: "@index used outside of forEach loop",
          };
        }
        return { value: ctx.index };
      }

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

      case "output": {
        if (ctx.output === undefined) {
          return {
            value: undefined,
            error: "@output used before workflow completion",
          };
        }
        const value = getValueByPath(ctx.output, parsed.path || "");
        if (value === undefined) {
          return {
            value: undefined,
            error: `Output path not found: @output.${parsed.path}`,
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
    // If it's a string that IS an @ref (entire value)
    if (isAtRef(value)) {
      const result = resolveRef(value, ctx);
      if (result.error) {
        errors.push({ ref: value, error: result.error });
      }
      return result.value;
    }

    // If it's a string that CONTAINS @refs, interpolate them
    if (typeof value === "string" && value.includes("@")) {
      return value.replace(AT_REF_PATTERN, (match) => {
        if (isAtRef(match as `@${string}`)) {
          const result = resolveRef(match as `@${string}`, ctx);
          if (result.error) {
            errors.push({ ref: match, error: result.error });
            return match; // Keep original if resolution fails
          }
          return String(result.value ?? "");
        }
        return match;
      });
    }

    // If it's an array, resolve each element
    if (Array.isArray(value)) {
      return value.map((v) => resolveValue(v));
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
 * Check if any @refs in an object would fail to resolve
 *
 * Used for trigger conditional logic - if any @ref can't resolve,
 * the trigger is skipped.
 */
export function canResolveAllRefs(input: unknown, ctx: RefContext): boolean {
  const { errors } = resolveAllRefs(input, ctx);
  return !errors || errors.length === 0;
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
