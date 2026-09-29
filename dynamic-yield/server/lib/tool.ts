import { createPrivateTool } from "@decocms/runtime/tools";
import type { z } from "zod";
import type { Env } from "../types/env.ts";

interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export function createDyTool<
  TSchema extends z.ZodObject<z.ZodRawShape>,
>(config: {
  id: string;
  description: string;
  inputSchema: TSchema;
  annotations: ToolAnnotations;
  handler: (
    input: z.infer<TSchema>,
    env: Env,
  ) => Promise<Record<string, unknown>>;
}) {
  return (_env: Env) =>
    createPrivateTool({
      id: config.id,
      description: config.description,
      inputSchema: config.inputSchema,
      annotations: config.annotations,
      execute: async ({ context, runtimeContext }) =>
        config.handler(context as z.infer<TSchema>, runtimeContext.env as Env),
    });
}
