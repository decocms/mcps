/**
 * Grain MCP Server
 *
 * This MCP provides tools for interacting with Grain's Knowledge Management System.
 *
 * Grain helps teams capture, organize, and share knowledge effectively.
 * This integration allows you to:
 * - Create and manage knowledge items
 * - Search through your knowledge base
 * - Organize content with tags and categories
 * - Collaborate on knowledge documentation
 */
import { type DefaultEnv, withRuntime } from "@decocms/runtime";

import { tools } from "./tools/index.ts";

/**
 * Environment type combining Deco bindings and Cloudflare Workers context
 */
export type Env = DefaultEnv & {
  GRAIN_API_KEY?: string;
  GRAIN_API_URL?: string;
};

const runtime = withRuntime<Env>({
  tools,
});

export default runtime;
