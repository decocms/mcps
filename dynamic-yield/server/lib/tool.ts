import { createTool } from "@decocms/runtime/tools";
import type { z } from "zod";
import type { Env } from "../types/env.ts";
import { withHeaderConfig } from "./request-config.ts";

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
  // Not createPrivateTool: direct clients (Claude, Copilot) have no Studio token.
  // The DY credentials themselves are the auth, see auth-exemptions.json.
  return (_env: Env) =>
    createTool({
      id: config.id,
      description: config.description,
      inputSchema: config.inputSchema,
      annotations: config.annotations,
      execute: async ({ context, runtimeContext }) =>
        config.handler(
          context as z.infer<TSchema>,
          withHeaderConfig(runtimeContext.env as Env),
        ),
    });
}
