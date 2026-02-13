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

console.log(
  "[VIRTUAL_TRY_ON_SERVER] 🚀 Initializing Virtual Try-On MCP server",
);
console.log(
  "[VIRTUAL_TRY_ON_SERVER] 📦 Number of registered tools:",
  tools.length,
);
console.log("[VIRTUAL_TRY_ON_SERVER] 🔐 Required scopes:", [
  "NANOBANANA::GENERATE_IMAGE",
]);

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    scopes: ["NANOBANANA::GENERATE_IMAGE"],
    state: StateSchema,
  },
  tools,
});

console.log("[VIRTUAL_TRY_ON_SERVER] ✅ Runtime configured successfully");

export default runtime;
