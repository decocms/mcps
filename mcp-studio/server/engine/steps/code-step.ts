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
  SandboxContext,
} from "../../sandbox/index.ts";
import { transform } from "sucrase";
import type { StepResult } from "../../types/step.ts";

export function transpileTypeScript(code: string): string {
  const result = transform(code, {
    transforms: ["typescript"],
    disableESTransforms: true, // Keep modern JS syntax for QuickJS
  });

  return result.code;
}

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

export async function executeCode(
  code: string,
  input: unknown,
  stepName: string,
): Promise<StepResult> {
  let ctx: SandboxContext | undefined;

  try {
    const jsCode = transpileTypeScript(code);
    const runtime = await createSandboxRuntime(
      `transform-${stepName}-${Date.now()}`,
      {
        memoryLimitBytes: 64 * 1024 * 1024,
        stackSizeBytes: 1 << 20,
      },
    );

    ctx = runtime.newContext({ interruptAfterMs: 10000 });
    installConsole(ctx);

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

    const defaultHandle = ctx.getProp(exportsHandle, "default");
    if (ctx.typeof(defaultHandle) !== "function") {
      return {
        error: "Transform must export a default function",
        startedAt: Date.now(),
        stepId: stepName,
      };
    }

    const callHandle = await callFunction(ctx, defaultHandle, undefined, input);
    return {
      completedAt: Date.now(),
      output: ctx.dump(ctx.unwrapResult(callHandle)),
      startedAt: Date.now(),
      stepId: stepName,
    };
  } catch (err) {
    return {
      completedAt: Date.now(),
      startedAt: Date.now(),
      error: err instanceof Error ? err.message : String(err),
      stepId: stepName,
    };
  } finally {
    ctx?.dispose();
  }
}

export async function validateCode(
  code: string,
  stepName: string,
): Promise<{
  valid: boolean;
  error?: string;
  schemas?: ReturnType<typeof extractSchemas>;
}> {
  let ctx: SandboxContext | undefined;

  try {
    const schemas = extractSchemas(code);
    const jsCode = transpileTypeScript(code);
    const runtime = await createSandboxRuntime(
      `validate-${stepName}-${Date.now()}`,
      {
        memoryLimitBytes: 32 * 1024 * 1024,
        stackSizeBytes: 512 * 1024,
      },
    );

    ctx = runtime.newContext({ interruptAfterMs: 5000 });
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
    ctx?.dispose();
  }
}
