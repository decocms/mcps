// Shim for Deno-style npm: imports in JSR packages
declare module "npm:@cloudflare/workers-types@^4.20250617.0" {
  export * from "@cloudflare/workers-types";
}

declare module "npm:zod@^3.25.76" {
  export * from "zod";
}

declare module "npm:@modelcontextprotocol/sdk@^1.19.1/types.js" {
  export * from "@modelcontextprotocol/sdk/types.js";
}

declare module "npm:@modelcontextprotocol/sdk@^1.19.1" {
  export * from "@modelcontextprotocol/sdk";
}

declare module "npm:@mastra/core@^0.20.2" {
  export * from "@mastra/core";
}
