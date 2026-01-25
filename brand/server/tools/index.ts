/**
 * Brand MCP Tools
 *
 * Complete toolset for brand research and design system generation.
 */
import { researchTools } from "./research.ts";
import { generatorTools } from "./generator.ts";
import { projectTools } from "./projects.ts";

export const tools = [...projectTools, ...researchTools, ...generatorTools];

export { researchTools } from "./research.ts";
export { generatorTools } from "./generator.ts";
export { projectTools } from "./projects.ts";
export { BrandIdentitySchema, type BrandIdentity } from "./research.ts";
export { BrandProjectSchema, type BrandProject } from "./projects.ts";
