/**
 * Central export point for all tools
 */
import { userTools } from "@decocms/mcps-shared/tools/user";
import { skillTools } from "./skills.ts";

export const tools = [...userTools, ...skillTools];

export { userTools } from "@decocms/mcps-shared/tools/user";
export { skillTools } from "./skills.ts";
