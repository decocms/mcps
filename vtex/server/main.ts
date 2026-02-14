/**
 * VTEX Commerce MCP
 *
 * MCP for VTEX Commerce APIs - Catalog, Orders, and Logistics/Inventory.
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
