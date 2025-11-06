/**
 * Central export point for all tools organized by domain.
 *
 * This file aggregates all tools from different domains into a single
 * export, making it easy to import all tools in main.ts while keeping
 * the domain separation.
 *
 * EXEMPLO DE ORGANIZAÇÃO:
 * ----------------------
 * Recomendamos criar um arquivo separado para cada domínio/categoria de
 * ferramentas. Por exemplo:
 *
 * - tools/user.ts       -> ferramentas relacionadas a usuários
 * - tools/storage.ts    -> ferramentas de armazenamento
 * - tools/database.ts   -> ferramentas de banco de dados
 * - tools/api.ts        -> ferramentas de integração com APIs
 *
 * Cada arquivo deve exportar um array com suas ferramentas:
 *
 * ```typescript
 * // tools/user.ts
 * export const createGetUserTool = (env: Env) =>
 *   createPrivateTool({
 *     id: "GET_USER",
 *     description: "Obtém informações do usuário",
 *     inputSchema: z.object({
 *       userId: z.string(),
 *     }),
 *     execute: async (ctx) => {
 *       // implementação
 *     },
 *   });
 *
 * export const userTools = [createGetUserTool];
 * ```
 *
 * Depois, importe e combine tudo aqui:
 *
 * ```typescript
 * import { userTools } from "./user.ts";
 * import { storageTools } from "./storage.ts";
 *
 * export const tools = [...userTools, ...storageTools];
 * ```
 */

// Quando você criar suas ferramentas, importe-as aqui:
// import { userTools } from "./user.ts";
// import { storageTools } from "./storage.ts";
// import { databaseTools } from "./database.ts";

// Export all tools from all domains
export const tools = [
  // Adicione suas ferramentas aqui
  // ...userTools,
  // ...storageTools,
  // ...databaseTools,
];

// Re-export domain-specific tools for direct access if needed
// export { userTools } from "./user.ts";
// export { storageTools } from "./storage.ts";
