/**
 * Bookmarks MCP Tools
 *
 * Aggregates all bookmark tools:
 * - CRUD: List, Get, Create, Update, Delete, Search
 * - Enrichment: Research, Scrape, Classify, EnrichBatch
 * - Import: ImportChrome, ImportFirefox
 */

import { crudTools } from "./crud.ts";
import { enrichmentTools } from "./enrichment.ts";
import { importTools } from "./import.ts";

/**
 * All tool factory functions.
 */
export const tools = [...crudTools, ...enrichmentTools, ...importTools];

// Re-export individual modules
export { crudTools } from "./crud.ts";
export { enrichmentTools } from "./enrichment.ts";
export { importTools } from "./import.ts";
