/**
 * Tools Export
 *
 * This file exports all tools that your MCP provides.
 * Tools are functions that can be called by AI agents.
 *
 * Each tool should be a factory function that takes Env and returns a tool.
 */

// Example: Import your tool factories here
// import { myToolFactory } from "./my-tool.ts";

/**
 * All tools provided by this MCP
 *
 * Add your tool factories to this array.
 * They will be automatically registered in main.ts
 */
export const tools = [
  // myToolFactory,
];

// Example tool factory:
//
// import { createPrivateTool } from "@decocms/runtime";
// import { z } from "zod";
//
// export const myToolFactory = (env: Env) =>
//   createPrivateTool({
//     id: "my_tool",
//     description: "Does something useful",
//     inputSchema: z.object({
//       param: z.string().describe("Input parameter"),
//     }),
//     outputSchema: z.object({
//       result: z.string().describe("Output result"),
//     }),
//     execute: async ({ input }) => {
//       // Your implementation here
//       return { result: `Processed: ${input.param}` };
//     },
//   });
