/**
 * Virtual Try-On MCP
 *
 * Receives a person photo + garment images and delegates generation to an image generator MCP.
 */
import { withRuntime } from "@decocms/runtime";

import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";

export type { Env };
export { StateSchema };

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    state: StateSchema,
  },
  tools,
});

export default runtime;
