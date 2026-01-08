/**
 * Transform Step Executor
 *
 * Executes pure TypeScript transformation steps in a QuickJS sandbox.
 *
 * Features:
 * - TypeScript transpilation to JavaScript (using sucrase for edge compatibility)
 * - Deterministic sandbox execution (no Date, Math.random, etc.)
 * - Input/Output interface extraction for validation (using ts-morph)
 *
 * @see docs/WORKFLOW_SCHEMA_DESIGN.md
 */

import { transform } from "sucrase";
import { Project, type InterfaceDeclaration, type Type } from "ts-morph";
import {
  callFunction,
  createSandboxRuntime,
  installConsole,
  type QuickJSHandle,
  type SandboxContext,
} from "../../sandbox/index.ts";
import type { StepResult } from "../../types/step.ts";

export function transpileTypeScript(code: string): string {
  const result = transform(code, {
    transforms: ["typescript"],
    disableESTransforms: true, // Keep modern JS syntax for QuickJS
  });

  return result.code;
}

/**
 * Convert a JSON Schema type to TypeScript type string
 */
function jsonSchemaTypeToTS(
  schema: Record<string, unknown>,
  indent = 0,
): string {
  const spaces = "  ".repeat(indent);

  if (!schema || Object.keys(schema).length === 0) {
    return "unknown";
  }

  // Handle anyOf/oneOf
  if (schema.anyOf || schema.oneOf) {
    const variants = (schema.anyOf || schema.oneOf) as Record<
      string,
      unknown
    >[];
    const types = variants.map((v) => jsonSchemaTypeToTS(v, indent));
    return types.join(" | ");
  }

  // Handle const values
  if (schema.const !== undefined) {
    return JSON.stringify(schema.const);
  }

  // Handle enum
  if (schema.enum) {
    return (schema.enum as unknown[]).map((v) => JSON.stringify(v)).join(" | ");
  }

  const type = schema.type as string | string[] | undefined;

  // Handle array of types
  if (Array.isArray(type)) {
    const types = type.map((t) =>
      jsonSchemaTypeToTS({ ...schema, type: t }, indent),
    );
    return types.join(" | ");
  }

  switch (type) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "array": {
      const items = schema.items as Record<string, unknown> | undefined;
      if (items) {
        return `${jsonSchemaTypeToTS(items, indent)}[]`;
      }
      return "unknown[]";
    }
    case "object": {
      const properties = schema.properties as
        | Record<string, Record<string, unknown>>
        | undefined;
      if (!properties || Object.keys(properties).length === 0) {
        return "Record<string, unknown>";
      }

      const required = new Set((schema.required as string[]) || []);
      const lines: string[] = ["{"];

      for (const [key, propSchema] of Object.entries(properties)) {
        const optional = !required.has(key) ? "?" : "";
        const propType = jsonSchemaTypeToTS(propSchema, indent + 1);
        lines.push(`${spaces}  ${key}${optional}: ${propType};`);
      }

      lines.push(`${spaces}}`);
      return lines.join("\n");
    }
    default:
      return "unknown";
  }
}

/**
 * Convert JSON Schema to TypeScript interface string
 */
export function jsonSchemaToTypeScript(
  schema: Record<string, unknown>,
  interfaceName = "Input",
): string {
  const typeBody = jsonSchemaTypeToTS(schema, 0);

  // If it's already a simple type, wrap in type alias
  if (!typeBody.startsWith("{")) {
    return `type ${interfaceName} = ${typeBody};`;
  }

  return `interface ${interfaceName} ${typeBody}`;
}

/**
 * Check if transform code needs Input interface injection
 * Returns true if:
 * - No Input interface exists
 * - Input interface uses `any` as the function parameter type
 */
export function needsInputInjection(code: string): boolean {
  // Check if function parameter is typed as `any`
  const funcParamMatch = code.match(
    /export\s+default\s+(?:async\s+)?function\s*\([^)]*:\s*any\s*\)/,
  );
  if (funcParamMatch) {
    return true;
  }

  // Check if Input interface exists and has meaningful content
  const inputMatch = code.match(/interface\s+Input\s*\{([^}]*)\}/);
  if (!inputMatch) {
    return true;
  }

  // Check if Input interface is empty or only has `any` types
  const body = inputMatch[1].trim();
  if (!body) {
    return true;
  }

  return false;
}

/**
 * Inject Input interface into transform code
 * Replaces existing Input interface or adds new one at the top
 */
export function injectInputInterface(
  code: string,
  inputInterface: string,
): string {
  // Remove existing Input interface if present
  const withoutInput = code.replace(/interface\s+Input\s*\{[^}]*\}\s*/g, "");

  // Also update the function signature to use Input type
  const withTypedParam = withoutInput.replace(
    /export\s+default\s+(async\s+)?function\s*\(\s*(\w+)\s*:\s*any\s*\)/,
    "export default $1function($2: Input)",
  );

  // Add Input interface at the top
  return `${inputInterface}\n\n${withTypedParam}`;
}

// Reusable ts-morph project for schema extraction (avoids re-creating for each call)
let tsMorphProject: Project | null = null;

function getProject(): Project {
  if (!tsMorphProject) {
    tsMorphProject = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        strict: true,
        target: 99, // ESNext
        module: 99, // ESNext
      },
    });
  }
  return tsMorphProject;
}

/**
 * Convert a ts-morph Type to JSON Schema
 */
function typeToJsonSchema(
  type: Type,
  visited = new Set<string>(),
): Record<string, unknown> {
  // Handle circular references
  const typeText = type.getText();
  if (visited.has(typeText) && type.isObject()) {
    return { type: "object" };
  }
  visited.add(typeText);

  // Handle union types
  if (type.isUnion()) {
    const unionTypes = type.getUnionTypes();
    // Check if it's a simple nullable type (T | null | undefined)
    const nonNullTypes = unionTypes.filter(
      (t) => !t.isNull() && !t.isUndefined(),
    );
    if (nonNullTypes.length === 1) {
      return typeToJsonSchema(nonNullTypes[0], new Set(visited));
    }
    return {
      anyOf: unionTypes
        .filter((t) => !t.isUndefined()) // Remove undefined from unions
        .map((t) => typeToJsonSchema(t, new Set(visited))),
    };
  }

  // Handle intersection types
  if (type.isIntersection()) {
    return {
      allOf: type
        .getIntersectionTypes()
        .map((t) => typeToJsonSchema(t, new Set(visited))),
    };
  }

  // Primitives
  if (type.isString()) return { type: "string" };
  if (type.isNumber()) return { type: "number" };
  if (type.isBoolean()) return { type: "boolean" };
  if (type.isNull()) return { type: "null" };
  if (type.isUndefined()) return {};
  if (type.isAny() || type.isUnknown()) return {};

  // Literal types
  if (type.isStringLiteral())
    return { type: "string", const: type.getLiteralValue() };
  if (type.isNumberLiteral())
    return { type: "number", const: type.getLiteralValue() };
  if (type.isBooleanLiteral())
    return { type: "boolean", const: type.getLiteralValue() };

  // Array types
  if (type.isArray()) {
    const elementType = type.getArrayElementType();
    return {
      type: "array",
      items: elementType ? typeToJsonSchema(elementType, new Set(visited)) : {},
    };
  }

  // Tuple types
  if (type.isTuple()) {
    const tupleTypes = type.getTupleElements();
    return {
      type: "array",
      items: tupleTypes.map((t) => typeToJsonSchema(t, new Set(visited))),
      minItems: tupleTypes.length,
      maxItems: tupleTypes.length,
    };
  }

  // Object/Interface types
  if (type.isObject()) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    // Get properties from the type
    const typeProperties = type.getProperties();
    for (const prop of typeProperties) {
      const propName = prop.getName();

      // Get property type safely - handle cases where declarations might be empty
      const valueDecl = prop.getValueDeclaration();
      const declarations = prop.getDeclarations();
      const location = valueDecl ?? declarations[0];

      // Skip properties without any declarations (e.g., built-in types)
      if (!location) {
        properties[propName] = {};
        continue;
      }

      const propType = prop.getTypeAtLocation(location);
      const isOptional = prop.isOptional();

      properties[propName] = typeToJsonSchema(propType, new Set(visited));
      if (!isOptional) {
        required.push(propName);
      }
    }

    // Handle index signatures (e.g., { [key: string]: unknown })
    const indexType = type.getStringIndexType();
    if (indexType && Object.keys(properties).length === 0) {
      return {
        type: "object",
        additionalProperties: typeToJsonSchema(indexType, new Set(visited)),
      };
    }

    return {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  }

  // Fallback
  return { type: "object" };
}

/**
 * Extract JSON Schema from an interface declaration
 */
function interfaceToJsonSchema(
  iface: InterfaceDeclaration,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const prop of iface.getProperties()) {
    const propName = prop.getName();
    const propType = prop.getType();
    const isOptional = prop.hasQuestionToken();

    properties[propName] = typeToJsonSchema(propType);
    if (!isOptional) {
      required.push(propName);
    }
  }

  // Handle index signatures
  const indexSignatures = iface.getIndexSignatures();
  if (indexSignatures.length > 0 && Object.keys(properties).length === 0) {
    const indexSig = indexSignatures[0];
    return {
      type: "object",
      additionalProperties: typeToJsonSchema(indexSig.getReturnType()),
    };
  }

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

/**
 * Extract Input and Output schemas from TypeScript transform code using ts-morph.
 * This properly handles nested types, unions, generics, etc.
 */
export function extractSchemas(code: string): {
  input: Record<string, unknown>;
  output: Record<string, unknown>;
} {
  const project = getProject();

  // Create a unique filename to avoid conflicts
  const fileName = `transform-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`;
  const sourceFile = project.createSourceFile(fileName, code, {
    overwrite: true,
  });

  try {
    const inputInterface = sourceFile.getInterface("Input");
    const outputInterface = sourceFile.getInterface("Output");

    // Also check for type aliases (type Input = ...)
    const inputTypeAlias = sourceFile.getTypeAlias("Input");
    const outputTypeAlias = sourceFile.getTypeAlias("Output");

    let inputSchema: Record<string, unknown> = { type: "object" };
    let outputSchema: Record<string, unknown> = { type: "object" };

    if (inputInterface) {
      inputSchema = interfaceToJsonSchema(inputInterface);
    } else if (inputTypeAlias) {
      inputSchema = typeToJsonSchema(inputTypeAlias.getType());
    }

    if (outputInterface) {
      outputSchema = interfaceToJsonSchema(outputInterface);
    } else if (outputTypeAlias) {
      outputSchema = typeToJsonSchema(outputTypeAlias.getType());
    }

    return { input: inputSchema, output: outputSchema };
  } finally {
    // Clean up the source file to prevent memory leaks
    project.removeSourceFile(sourceFile);
  }
}

/**
 * Summarize input for error messages (truncated to avoid huge error messages)
 */
function summarizeInput(input: unknown, maxLength = 500): string {
  try {
    const json = JSON.stringify(input, null, 2);
    if (json.length <= maxLength) return json;
    return json.substring(0, maxLength) + "... (truncated)";
  } catch {
    return String(input);
  }
}

/**
 * Detect common issues with input and provide helpful warnings
 */
function validateTransformInput(input: unknown): string[] {
  const warnings: string[] = [];

  if (input === undefined) {
    warnings.push(
      "Input is undefined - the transform function will receive undefined as its argument",
    );
  } else if (input === null) {
    warnings.push(
      "Input is null - make sure your transform handles null values",
    );
  } else if (typeof input === "object" && input !== null) {
    // Check for common undefined nested properties
    const obj = input as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined) {
        warnings.push(`Input.${key} is undefined`);
      }
    }
  }

  return warnings;
}

export async function executeCode(
  code: string,
  input: unknown,
  stepName: string,
): Promise<StepResult> {
  let ctx: SandboxContext | undefined;
  const startedAt = Date.now();

  // Validate input and collect warnings
  const inputWarnings = validateTransformInput(input);
  if (inputWarnings.length > 0) {
    console.warn(`[TRANSFORM] Warnings for step "${stepName}":`, inputWarnings);
  }

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
        startedAt,
        completedAt: Date.now(),
        stepId: stepName,
      };
    }

    const callHandle = await callFunction(ctx, defaultHandle, undefined, input);
    return {
      completedAt: Date.now(),
      output: ctx.dump(ctx.unwrapResult(callHandle)),
      startedAt,
      stepId: stepName,
    };
  } catch (err) {
    const baseError = err instanceof Error ? err.message : String(err);

    // Enhance error message with input context for common runtime errors
    let enhancedError = baseError;
    if (
      baseError.includes("cannot read property") ||
      baseError.includes("undefined")
    ) {
      enhancedError = `${baseError}\n\nInput received by transform:\n${summarizeInput(input)}`;
      if (inputWarnings.length > 0) {
        enhancedError += `\n\nWarnings:\n- ${inputWarnings.join("\n- ")}`;
      }
    }

    return {
      completedAt: Date.now(),
      startedAt,
      error: enhancedError,
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
