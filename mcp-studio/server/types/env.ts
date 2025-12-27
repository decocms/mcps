/**
 * Environment Type Definitions
 *
 * Central definition for the Env type used throughout the workflow system.
 */

import { BindingOf, type DefaultEnv } from "@decocms/runtime";
import type { EventBusBindingClient } from "@decocms/bindings";
import z from "zod";

export const StateSchema = z.object({
  DATABASE: BindingOf("@deco/postgres"),
  EVENT_BUS: BindingOf("@deco/event-bus"),
  CONNECTION: BindingOf("@deco/connection"),
});

export type DatabaseBinding = {
  DATABASES_RUN_SQL: (params: {
    sql: string;
    params: unknown[];
  }) => Promise<{ result: { results: unknown[] }[] }>;
};

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
};

export type Env = DefaultEnv<typeof StateSchema> & {
  DATABASE: DatabaseBinding;
  EVENT_BUS: EventBusBindingClient;
  CONNECTION: ConnectionBinding;
};
