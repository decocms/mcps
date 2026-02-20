/**
 * VTEX Commerce MCP
 *
 * MCP for VTEX Commerce APIs - Catalog, Orders, and Logistics/Inventory.
 */
import { withRuntime } from "@decocms/runtime";
import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";
import packageJson from "../package.json" with { type: "json" };

console.log(`VTEX Commerce MCP v${packageJson.version}`);

export type { Env };
export { StateSchema };

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    state: StateSchema,
  },
  tools,
});

export default runtime;
