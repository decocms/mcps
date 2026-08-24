/**
 * Central export of all Wake MCP tools.
 *
 * V1: read-only Storefront GraphQL operations.
 */
import { productTools } from "./products.ts";
import { catalogTools } from "./catalog.ts";
import { storeTools } from "./store.ts";

export const tools = [...productTools, ...catalogTools, ...storeTools];
