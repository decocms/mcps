/**
 * Environment Type Definitions
 */
import { type DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const ArticleStatusEnum = z.enum([
  "draft",
  "pending_review",
  "approved",
  "published",
  "archived",
]);

export type ArticleStatus = z.infer<typeof ArticleStatusEnum>;

export const CategoryEnum = z.enum([
  "AI & Machine Learning",
  "eCommerce",
  "Developer Tools",
  "Platform Updates",
  "Community",
  "Tutorials",
  "Case Studies",
  "Industry News",
]);

export type Category = z.infer<typeof CategoryEnum>;

export const StateSchema = z.object({
  database: z.object({
    apiUrl: z
      .string()
      .describe(
        "URL da API do MCP para executar queries SQL (ex: https://api.decocms.com/org/project/mcp/tool/DATABASES_RUN_SQL)",
      ),
    token: z.string().describe("Token de autenticação Bearer para a API"),
  }),
});

type State = z.infer<typeof StateSchema>;

export type Env = DefaultEnv<typeof StateSchema> & {
  DECO_CHAT_REQUEST_CONTEXT: {
    state: State;
  };
};
