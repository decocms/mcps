/**
 * Central export point for all VTEX tools.
 * 
 * This file aggregates all tools from different domains into a single
 * export, making it easy to import all tools in main.ts while keeping
 * the domain separation.
 * 
 * Tools are organized by domain:
 * - productTools: Search, get product, suggestions
 * - cartTools: Get cart, add to cart, update cart
 * - userTools: Standard user management (from @decocms/mcps-shared when available)
 */
import { productTools } from "./products.ts";
import { cartTools } from "./cart.ts";

// Aggregate all VTEX-specific tool factories
export const vtexTools = [...productTools, ...cartTools];

// For standalone usage or when @decocms/mcps-shared is not available
export const tools = vtexTools;

// Re-export domain-specific tools for direct access
export { productTools } from "./products.ts";
export { cartTools } from "./cart.ts";
