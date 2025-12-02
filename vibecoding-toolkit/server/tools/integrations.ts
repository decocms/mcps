import { createPrivateTool } from "@decocms/runtime/tools";
import { Env } from "../main.ts";
import z from "zod";
import Fuse from "fuse.js";

const createListTool = (env: Env) =>
  createPrivateTool({
    id: "STORE_LIST_INTEGRATIONS",
    description: "List integrations with filtering, sorting, and pagination",
    inputSchema: z.object({
      query: z.string().optional(),
      withTools: z.boolean().default(false),
    }),
    outputSchema: z.object({
      items: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          description: z.string(),
          icon: z.string().optional(),
          appId: z.union([z.string(), z.unknown()]),
          appName: z.union([z.string(), z.unknown()]),
          verified: z.union([z.boolean(), z.unknown()]),
          available: z
            .boolean()
            .describe(
              "Whether the integration is already installed and enabled",
            ),
          tools: z
            .array(
              z.object({
                name: z.string(),
                description: z.string().optional(),
              }),
            )
            .optional(),
        }),
      ),
    }),
    execute: async ({ context }) => {
      const installedIntegrations = env.INTEGRATIONS.INTEGRATIONS_LIST({});
      const searchIntegrations = env.INTEGRATIONS.DECO_INTEGRATIONS_SEARCH({});

      const integrations = new Set<string>();
      return Promise.all([installedIntegrations, searchIntegrations]).then(
        ([installedIntegrations, searchIntegrations]) => {
          const result = [
            ...installedIntegrations.items.map((item) => ({
              ...item,
              available: true,
            })),
            ...searchIntegrations.integrations,
          ].filter((item) => {
            if (integrations.has(item.id)) return false;
            integrations.add(item.id);
            return true;
          });

          const fuse = new Fuse(result, {
            keys: ["name", "description"],
          });
          const fuseResult = fuse
            .search(context.query ?? "")
            .map((item) => item.item);
          return {
            items: fuseResult.map((item) => ({
              id: item.id,
              icon: item.icon,
              appId: item.appId,
              appName: item.appName,
              verified: item.verified,
              name: item.name,
              description: item.description ?? "",
              available: installedIntegrations.items.some(
                (installed) => installed.id === item.id,
              ),
              tools: context.withTools
                ? (item.tools?.map((tool) => ({
                    name: tool.name,
                    description: tool.description,
                  })) ?? [])
                : undefined,
            })),
          };
        },
      );
    },
  });

const createListToolsTool = (env: Env) =>
  createPrivateTool({
    id: "STORE_LIST_INTEGRATION_TOOLS",
    description:
      "List tools from an integration with filtering, sorting, and pagination",
    inputSchema: z.object({
      integrationId: z.string(),
    }),
    outputSchema: z.object({
      items: z.array(
        z.object({
          name: z.string(),
          description: z.string().optional(),
        }),
      ),
    }),
    execute: async ({ context }) => {
      let integration = null;
      try {
        integration = (await env.INTEGRATIONS.INTEGRATIONS_GET({
          id: context.integrationId,
        })) as unknown as {
          tools: { id: string; name: string; description: string }[];
        };
        return {
          items: integration.tools?.map((tool) => ({
            name: tool.name,
            description: tool.description,
          })),
        };
      } catch {
        console.error(
          `Integration ${context.integrationId} not found in primary store`,
        );
      }

      try {
        const allIntegrations = await env.SELF.STORE_LIST_INTEGRATIONS({
          query: "",
          withTools: true,
        }).then((result) =>
          result.items.find((item) => item.id === context.integrationId),
        );
        return {
          items: allIntegrations?.tools ?? [],
        };
      } catch {
        console.error(
          `Integration ${context.integrationId} not found in secondary store`,
        );
      }

      return {
        items: [],
      };
    },
  });

export const integrationsTools = [createListTool, createListToolsTool];
