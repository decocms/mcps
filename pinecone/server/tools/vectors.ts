/**
 * Pinecone vector operations tools.
 *
 * This file uses the shared vector database tools factory to create
 * Pinecone-specific MCP tools with minimal boilerplate.
 * Follows the same pattern as veo, nanobanana, and object-storage MCPs.
 */

import { createPineconeClient } from "../lib/pinecone-client.ts";
import { getVectorDatabaseToolsArray } from "@decocms/mcps-shared/tools";

import type { Env } from "../main.ts";

/**
 * Creates vector database tool factories for Pinecone
 * These factories are called by the MCP server to create the actual tools
 */
export const createUpsertVectorsTool = (env: Env) => {
  const tools = getVectorDatabaseToolsArray({
    getClient: () => createPineconeClient(env),
    getDefaultNamespace: () => env.DECO_CHAT_REQUEST_CONTEXT.state.namespace,
  });
  return tools[0]; // upsert tool
};

export const createQueryVectorsTool = (env: Env) => {
  const tools = getVectorDatabaseToolsArray({
    getClient: () => createPineconeClient(env),
    getDefaultNamespace: () => env.DECO_CHAT_REQUEST_CONTEXT.state.namespace,
  });
  return tools[1]; // query tool
};

export const createFetchVectorsTool = (env: Env) => {
  const tools = getVectorDatabaseToolsArray({
    getClient: () => createPineconeClient(env),
    getDefaultNamespace: () => env.DECO_CHAT_REQUEST_CONTEXT.state.namespace,
  });
  return tools[2]; // fetch tool
};

export const createDeleteVectorsTool = (env: Env) => {
  const tools = getVectorDatabaseToolsArray({
    getClient: () => createPineconeClient(env),
    getDefaultNamespace: () => env.DECO_CHAT_REQUEST_CONTEXT.state.namespace,
  });
  return tools[3]; // delete tool
};

// Export all vector tools as an array
export const vectorTools = [
  createUpsertVectorsTool,
  createQueryVectorsTool,
  createFetchVectorsTool,
  createDeleteVectorsTool,
];
