/**
 * Strapi Components Tools
 *
 * Tools for inspecting reusable components in Strapi CMS.
 * Components are reusable field groups used across content types.
 *
 * @see https://docs.strapi.io/dev-docs/api/rest/content-type
 */
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { makeRequest } from "../../../lib/strapi.api.ts";
import type { Env } from "../../../types/env.ts";
import type {
  StrapiComponentSchema,
  ToolResponse,
} from "../../../types/strapi.ts";

/**
 * List all available components.
 *
 * GET /api/content-type-builder/components
 */
export const createStrapiGetComponentsTool = (env: Env) =>
  createTool({
    id: "STRAPI_GET_COMPONENTS",
    description:
      "Lista todos os componentes reutilizáveis do Strapi CMS, agrupados por categoria.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.array(z.any()).optional(),
      error: z.string().optional(),
    }),
    execute: async (): Promise<ToolResponse<StrapiComponentSchema[]>> => {
      try {
        const response = await makeRequest(
          env,
          "api/content-type-builder/components",
          "GET",
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao buscar componentes: ${response.status}`,
          };
        }

        const responseData = response.data as {
          data?: StrapiComponentSchema[];
        };
        return {
          success: true,
          data:
            responseData?.data ??
            (responseData as unknown as StrapiComponentSchema[]),
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Erro desconhecido";
        return {
          success: false,
          error: `Erro ao buscar componentes: ${message}`,
        };
      }
    },
  });

/**
 * Get details of a specific component.
 *
 * GET /api/content-type-builder/components/:uid
 */
export const createStrapiGetComponentDetailTool = (env: Env) =>
  createTool({
    id: "STRAPI_GET_COMPONENT_DETAIL",
    description:
      "Obtém detalhes de um componente específico incluindo seus atributos e configuração.",
    inputSchema: z.object({
      uid: z
        .string()
        .describe(
          "UID do componente (ex: 'shared.seo', 'sections.hero', 'blocks.rich-text')",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.any().optional(),
      error: z.string().optional(),
    }),
    execute: async ({
      context: { uid },
    }): Promise<ToolResponse<StrapiComponentSchema>> => {
      try {
        const response = await makeRequest(
          env,
          `api/content-type-builder/components/${uid}`,
          "GET",
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao buscar componente '${uid}': ${response.status}`,
          };
        }

        const responseData = response.data as {
          data?: StrapiComponentSchema;
        };
        const componentData: StrapiComponentSchema =
          responseData?.data ??
          (responseData as unknown as StrapiComponentSchema);
        return {
          success: true,
          data: componentData,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Erro desconhecido";
        return {
          success: false,
          error: `Erro ao buscar componente: ${message}`,
        };
      }
    },
  });

export const strapiComponentsTools = [
  createStrapiGetComponentsTool,
  createStrapiGetComponentDetailTool,
];
