import {
  createSandboxRuntime,
  inspect,
  installConsole,
  QuickJSHandle,
} from "../cf-sandbox/index.ts";
import { Validator } from "jsonschema";

// Cache for compiled validators
const validatorCache = new Map<string, Validator>();

export function validate(instance: unknown, schema: Record<string, unknown>) {
  const schemaKey = JSON.stringify(schema);
  let validator = validatorCache.get(schemaKey);

  if (!validator) {
    validator = new Validator();
    validator.addSchema(schema);

    validatorCache.set(schemaKey, validator);
  }

  return validator.validate(instance, schema);
}

// Common function for evaluating code and returning default handle
export const evalCodeAndReturnDefaultHandle = async (
  code: string,
  runtimeId: string,
) => {
  // Create sandbox runtime to validate the function
  const runtime = await createSandboxRuntime(runtimeId, {
    memoryLimitBytes: 64 * 1024 * 1024, // 64MB
    stackSizeBytes: 1 << 20, // 1MB,
  });

  const ctx = runtime.newContext({ interruptAfterMs: 100 });

  // Install built-ins
  const guestConsole = installConsole(ctx);

  // Validate the function by evaluating it as an ES module
  const result = ctx.evalCode(code, "index.js", {
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

  return {
    ctx,
    defaultHandle,
    guestConsole,
    [Symbol.dispose]: ctx.dispose.bind(ctx),
  };
};

  // Helper function to validate execute code
export async function validateExecuteCode(
  functionCode: string,
  runtimeId: string,
  name: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    using evaluation = await evalCodeAndReturnDefaultHandle(
      functionCode,
      runtimeId,
    );
    const { ctx, defaultHandle } = evaluation;

    if (ctx.typeof(defaultHandle) !== "function") {
      return {
        success: false,
        error: `${name} must export a default function`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Validation error for ${name}: ${inspect(error)}`,
    };
  }
}
