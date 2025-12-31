/**
 * Tools Index
 *
 * Central export point for all memory tools.
 * Uses plain functions that can be registered directly with MCP.
 */

import {
  AddMemoryInputSchema,
  AddMemoryOutputSchema,
  executeAddMemory,
} from "./add.ts";

import {
  GetMemoryInputSchema,
  GetMemoryOutputSchema,
  executeGetMemory,
} from "./get.ts";

import {
  SearchMemoryInputSchema,
  SearchMemoryOutputSchema,
  executeSearchMemory,
} from "./search.ts";

import {
  LinkMemoryInputSchema,
  LinkMemoryOutputSchema,
  executeLinkMemory,
} from "./link.ts";

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * memory.add - Add a new memory with automatic embedding
 */
export const addMemoryTool = {
  id: "memory.add",
  description:
    "Add a new memory to the database. Automatically generates embeddings for semantic search. " +
    "Supports deduplication - if the same content already exists in the namespace, returns the existing memory.",
  inputSchema: AddMemoryInputSchema,
  outputSchema: AddMemoryOutputSchema,
  execute: executeAddMemory,
} as const;

/**
 * memory.get - Get a specific memory by ID
 */
export const getMemoryTool = {
  id: "memory.get",
  description:
    "Retrieve a specific memory by its UUID. Returns the full memory record including content, metadata, and tags.",
  inputSchema: GetMemoryInputSchema,
  outputSchema: GetMemoryOutputSchema,
  execute: executeGetMemory,
} as const;

/**
 * memory.search - Semantic search for memories
 */
export const searchMemoryTool = {
  id: "memory.search",
  description:
    "Search memories using semantic similarity. The query is embedded and compared against stored memories " +
    "using cosine similarity. Supports filtering by tags, source type, and date range. " +
    "Optionally returns related memories via graph traversal.",
  inputSchema: SearchMemoryInputSchema,
  outputSchema: SearchMemoryOutputSchema,
  execute: executeSearchMemory,
} as const;

/**
 * memory.link - Create edges between memories
 */
export const linkMemoryTool = {
  id: "memory.link",
  description:
    "Create a relationship between two memories. Supports relationship types: " +
    "'updates' (newer version), 'extends' (adds to), 'derives' (based on), 'mentions' (references). " +
    "Edges are used for graph traversal in search results.",
  inputSchema: LinkMemoryInputSchema,
  outputSchema: LinkMemoryOutputSchema,
  execute: executeLinkMemory,
} as const;

/**
 * All memory tools as an array
 */
export const tools = [
  addMemoryTool,
  getMemoryTool,
  searchMemoryTool,
  linkMemoryTool,
];

// Re-export types
export type { AddMemoryInput, AddMemoryOutput } from "./add.ts";
export type { GetMemoryInput, GetMemoryOutput } from "./get.ts";
export type { SearchMemoryInput, SearchMemoryOutput } from "./search.ts";
export type { LinkMemoryInput, LinkMemoryOutput } from "./link.ts";
