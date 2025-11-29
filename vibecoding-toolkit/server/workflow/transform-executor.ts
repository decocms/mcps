/**
 * Transform Step Executor
 *
 * Executes pure TypeScript transformation steps in a QuickJS sandbox.
 *
 * Features:
 * - TypeScript transpilation to JavaScript (using sucrase for edge compatibility)
 * - Deterministic sandbox execution (no Date, Math.random, etc.)
 * - Input/Output interface extraction for validation
 *
 * @see docs/WORKFLOW_SCHEMA_DESIGN.md
 */

import {
  createSandboxRuntime,
  callFunction,
  installConsole,
  type QuickJSHandle,
} from "@deco/cf-sandbox";
import { transform } from "sucrase";

/**
 * Transpile TypeScript to JavaScript using sucrase.
 *
 * Sucrase is a fast, lightweight TypeScript transformer that works in edge
 * environments (Cloudflare Workers) where the full TypeScript compiler doesn't.
 */
export function transpileTypeScript(code: string): string {
  const result = transform(code, {
    transforms: ["typescript"],
    disableESTransforms: true, // Keep modern JS syntax for QuickJS
  });

  return result.code;
}

/**
 * Extract Input and Output interface schemas from TypeScript code
 *
 * This is a simplified parser - in production you'd use the TypeScript compiler API
 * to properly parse and convert interfaces to JSON Schema.
 */
export function extractSchemas(code: string): {
  input: Record<string, unknown>;
  output: Record<string, unknown>;
} {
  const inputMatch = code.match(/interface\s+Input\s*\{([^}]*)\}/);
  const outputMatch = code.match(/interface\s+Output\s*\{([^}]*)\}/);

  const parseInterfaceBody = (body: string): Record<string, unknown> => {
    if (!body.trim()) return { type: "object" };

    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    // Parse simple property declarations
    const propRegex = /(\w+)(\?)?\s*:\s*([^;]+);/g;
    let match;

    while ((match = propRegex.exec(body)) !== null) {
      const [, name, optional, typeStr] = match;
      const type = typeStr.trim();

      if (!optional) {
        required.push(name);
      }

      properties[name] = parseTypeToSchema(type);
    }

    return {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  };

  const parseTypeToSchema = (type: string): Record<string, unknown> => {
    type = type.trim();

    // Array types
    if (type.endsWith("[]")) {
      return {
        type: "array",
        items: parseTypeToSchema(type.slice(0, -2)),
      };
    }
    if (type.startsWith("Array<") && type.endsWith(">")) {
      return {
        type: "array",
        items: parseTypeToSchema(type.slice(6, -1)),
      };
    }

    // Object type with inline properties
    if (type.startsWith("{") && type.endsWith("}")) {
      return parseInterfaceBody(type.slice(1, -1));
    }

    // Primitive types
    switch (type) {
      case "string":
        return { type: "string" };
      case "number":
        return { type: "number" };
      case "boolean":
        return { type: "boolean" };
      case "null":
        return { type: "null" };
      case "unknown":
      case "any":
        return {};
      default:
        // For complex types, just return object
        return { type: "object" };
    }
  };

  return {
    input: inputMatch ? parseInterfaceBody(inputMatch[1]) : { type: "object" },
    output: outputMatch
      ? parseInterfaceBody(outputMatch[1])
      : { type: "object" },
  };
}

/**
 * Transform execution result
 */
export interface TransformResult {
  success: boolean;
  output?: unknown;
  error?: string;
  logs?: string[];
}

/**
 * Execute a transform step in the QuickJS sandbox
 *
 * @param code - TypeScript code with Input/Output interfaces
 * @param input - Input data (already resolved @refs)
 * @param stepName - Step name for logging
 */
export async function executeTransform(
  code: string,
  input: unknown,
  stepName: string,
): Promise<TransformResult> {
  let ctx: any;
  let runtime: any;

  try {
    // 1. Transpile TypeScript to JavaScript
    const jsCode = transpileTypeScript(code);

    // 2. Create sandbox runtime
    runtime = await createSandboxRuntime(`transform-${stepName}`, {
      memoryLimitBytes: 64 * 1024 * 1024, // 64MB
      stackSizeBytes: 1 << 20, // 1MB
    });

    ctx = runtime.newContext({ interruptAfterMs: 10000 }); // 10s timeout

    // 3. Install console for logging
    const guestConsole = installConsole(ctx);

    // 4. Evaluate the module
    const result = ctx.evalCode(jsCode, "transform.js", {
      strict: true,
      strip: true,
      type: "module",
    });

    let exportsHandle: QuickJSHandle;
    if (ctx.runtime.hasPendingJob()) {
      const promise = ctx.resolvePromise(ctx.unwrapResult(result));
      ctx.runtime.executePendingJobs();
      exportsHandle = ctx.unwrapResult(await promise);
    } else {
      exportsHandle = ctx.unwrapResult(result);
    }

    // 5. Get the default export
    const defaultHandle = ctx.getProp(exportsHandle, "default");

    if (ctx.typeof(defaultHandle) !== "function") {
      return {
        success: false,
        error: "Transform must export a default function",
      };
    }

    // 6. Call the function with input
    const callHandle = await callFunction(ctx, defaultHandle, undefined, input);
    const unwrappedResult = ctx.unwrapResult(callHandle);
    const output = ctx.dump(unwrappedResult);

    return {
      success: true,
      output,
      logs: guestConsole.logs.map((log) =>
        typeof log === "string" ? log : JSON.stringify(log),
      ),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (ctx) {
      ctx.dispose();
    }
    if (runtime) {
      runtime.dispose();
    }
  }
}

/**
 * Validate transform code without executing it
 */
export async function validateTransformCode(
  code: string,
  stepName: string,
): Promise<{
  valid: boolean;
  error?: string;
  schemas?: ReturnType<typeof extractSchemas>;
}> {
  let ctx: any;
  let runtime: any;

  try {
    // 1. Extract schemas
    const schemas = extractSchemas(code);

    // 2. Transpile TypeScript to JavaScript
    const jsCode = transpileTypeScript(code);

    // 3. Create sandbox runtime for validation
    runtime = await createSandboxRuntime(`validate-${stepName}`, {
      memoryLimitBytes: 32 * 1024 * 1024,
      stackSizeBytes: 512 * 1024,
    });

    ctx = runtime.newContext({ interruptAfterMs: 5000 });

    // 4. Try to evaluate the code
    const result = ctx.evalCode(jsCode, "validate.js", {
      strict: true,
      strip: true,
      type: "module",
    });

    let exportsHandle: QuickJSHandle;
    if (ctx.runtime.hasPendingJob()) {
      const promise = ctx.resolvePromise(ctx.unwrapResult(result));
      ctx.runtime.executePendingJobs();
      exportsHandle = ctx.unwrapResult(await promise);
    } else {
      exportsHandle = ctx.unwrapResult(result);
    }

    // 5. Check for default export
    const defaultHandle = ctx.getProp(exportsHandle, "default");

    if (ctx.typeof(defaultHandle) !== "function") {
      return {
        valid: false,
        error: "Transform must export a default function",
      };
    }

    return { valid: true, schemas };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (ctx) {
      ctx.dispose();
    }
    if (runtime) {
      runtime.dispose();
    }
  }
}
