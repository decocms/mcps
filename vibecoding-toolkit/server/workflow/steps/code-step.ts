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
  type SandboxRuntime,
  SandboxContext,
} from "../../lib/sandbox/index.ts";
import { transform } from "sucrase";

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

export interface CodeResult {
  success: boolean;
  output?: unknown;
  error?: string;
  logs?: string[];
}
export async function executeCode(
  code: string,
  input: unknown,
  stepName: string,
): Promise<CodeResult> {
  let ctx: SandboxContext | undefined;

  console.log(`[SANDBOX] Starting executeCode for '${stepName}'`);

  try {
    console.log(`[SANDBOX] Transpiling TypeScript for '${stepName}'`);
    const jsCode = transpileTypeScript(code);
    console.log(`[SANDBOX] Transpiled OK, creating runtime for '${stepName}'`);

    const runtime = await createSandboxRuntime(
      `transform-${stepName}-${Date.now()}`,
      {
        memoryLimitBytes: 64 * 1024 * 1024, // 64MB
        stackSizeBytes: 1 << 20, // 1MB
      },
    );
    console.log(`[SANDBOX] Runtime created for '${stepName}'`);

    ctx = runtime.newContext({ interruptAfterMs: 10000 }); // 10s timeout
    console.log(`[SANDBOX] Context created for '${stepName}'`);

    const guestConsole = installConsole(ctx);

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
        success: false,
        error: "Transform must export a default function",
      };
    }

    const callHandle = await callFunction(ctx, defaultHandle, undefined, input);
    const unwrappedResult = ctx.unwrapResult(callHandle);
    const output = ctx.dump(unwrappedResult);
    const logs = guestConsole.logs.map((log) =>
      typeof log === "string" ? log : JSON.stringify(log),
    );

    return {
      success: true,
      output,
      logs,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    ctx?.dispose();
  }
}

/**
 * Validate transform code without executing it
 */
export async function validateCode(
  code: string,
  stepName: string,
): Promise<{
  valid: boolean;
  error?: string;
  schemas?: ReturnType<typeof extractSchemas>;
}> {
  let ctx: SandboxContext | undefined;
  let runtime: SandboxRuntime;

  try {
    const schemas = extractSchemas(code);

    const jsCode = transpileTypeScript(code);

    runtime = await createSandboxRuntime(`validate-${stepName}-${Date.now()}`, {
      memoryLimitBytes: 32 * 1024 * 1024,
      stackSizeBytes: 512 * 1024,
    });

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
