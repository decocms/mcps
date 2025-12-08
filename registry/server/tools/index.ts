/**
 * Central export point for all tools organized by domain.
 *
 * This file aggregates all tools from different domains into a single
 * export, making it easy to import all tools in main.ts while keeping
 * the domain separation.
 *
 * Nota: Os tools de registry precisam da Env para acessar a configuração
 * do registryUrl, portanto são funções criadas na inicialização do runtime.
 */

import {
  createListRegistryTool,
  createGetRegistryTool,
} from "./registry-binding.ts";

export const tools = [createListRegistryTool, createGetRegistryTool];
