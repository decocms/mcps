/**
 * Central export point for all tools organized by domain.
 *
 * This file aggregates all tools from different domains into a single
 * export, making it easy to import all tools in main.ts while keeping
 * the domain separation.
 *
 * Note: Registry tools need Env to access the registryUrl configuration,
 * so they are created as functions during runtime initialization.
 */

import {
  createListRegistryTool,
  createGetRegistryTool,
  createVersionsRegistryTool,
  createFiltersRegistryTool,
} from "./registry-binding.ts";

export const tools = [
  createListRegistryTool,
  createGetRegistryTool,
  createVersionsRegistryTool,
  createFiltersRegistryTool,
];
