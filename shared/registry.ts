import type { EVENT_BUS_BINDING } from "@decocms/bindings";
import type { createCollectionBindings } from "@decocms/bindings/collections";
import type { BindingRegistry } from "@decocms/runtime";
import { z } from "zod";

export type ConnectionBinding = {
  COLLECTION_CONNECTIONS_UPDATE: (params: {
    id: string;
    data: {
      configuration_state: object;
      configuration_scopes: string[];
    };
  }) => Promise<unknown>;
  COLLECTION_CONNECTIONS_GET: (params: { id: string }) => Promise<{
    item: {
      configuration_state: object;
      configuration_scopes: string[];
      tools: {
        name: string;
        description: string;
        inputSchema: object;
        outputSchema: object;
      }[];
    };
  }>;
  // Accepts an (empty) object because MCP tool validation rejects `undefined` inputs.
  COLLECTION_CONNECTIONS_LIST: (params?: Record<string, never>) => Promise<{
    items: {
      id: string;
      title: string;
      tools: {
        name: string;
        description: string;
        inputSchema: object;
        outputSchema: object;
      }[];
    }[];
  }>;
};
const ConnectionSchema = z.object({
  configuration_state: z.object({}),
  configuration_scopes: z.array(z.string()),
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      inputSchema: z.object({}),
      outputSchema: z.object({}),
    }),
  ),
});

export interface Registry extends BindingRegistry {
  "@deco/event-bus": typeof EVENT_BUS_BINDING;
  "@deco/connection": ReturnType<
    typeof createCollectionBindings<typeof ConnectionSchema, "connections">
  >;
  "@deco/postgres": [
    {
      name: "DATABASES_RUN_SQL";
      description: "Run a SQL query against the database";
      inputSchema: z.ZodType<{
        sql: string;
        params?: unknown[];
      }>;
      outputSchema: z.ZodType<{
        result: {
          results?: unknown[];
          success?: boolean;
        }[];
      }>;
    },
  ];
  "@deco/wallet": [
    {
      name: "COMMIT_PRE_AUTHORIZED_AMOUNT";
      inputSchema: z.ZodType<{
        identifier?: string;
        contractId: string;
        vendorId: string;
        amount: string; // in microdollars
        metadata?: Record<string, unknown>;
      }>;
      outputSchema: z.ZodType<{
        id: string;
      }>;
    },
    {
      name: "PRE_AUTHORIZE_AMOUNT";
      inputSchema: z.ZodType<{
        amount: string; // in microdollars
        metadata?: Record<string, unknown>;
      }>;
      outputSchema: z.ZodType<{
        id: string;
      }>;
    },
  ];
}
