// Generated types - do not edit manually

import type { MCPClientFetchStub } from "@decocms/bindings/client";
import type { CollectionBinding } from "@decocms/bindings/collections";
import type { MCPConnection } from "@decocms/bindings/connection";
import { z } from "zod";

export type McpMesh = MCPClientFetchStub<
	CollectionBinding<MCPConnection, "CONNECTIONS">
>;

export type Mcp<T extends Record<string, (input: any) => Promise<any>>> = {
	$listTools: () => Promise<
		{
			id: string;
			description: string;
			inputSchema: z.ZodType;
			outputSchema: z.ZodType;
			execute: (input: unknown) => Promise<unknown>;
		}[]
	>;
} & {
	[K in keyof T]: ((
		input: Parameters<T[K]>[0],
	) => Promise<Awaited<ReturnType<T[K]>>>) & {
		asTool: () => Promise<{
			inputSchema: z.ZodType<Parameters<T[K]>[0]>;
			outputSchema?: z.ZodType<Awaited<ReturnType<T[K]>>>;
			description: string;
			id: string;
			execute: (
				input: Parameters<T[K]>[0],
			) => Promise<Awaited<ReturnType<T[K]>>>;
		}>;
	};
};

export const StateSchema = z.object({});

export interface Env {
	DECO_CHAT_WORKSPACE: string;
	DECO_CHAT_API_JWT_PUBLIC_KEY: string;
	MCPS: Mcp<McpMesh>[];
}

export const Scopes = {};
