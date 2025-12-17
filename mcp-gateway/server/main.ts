/**
 * This is the main entry point for your application and
 * MCP server. This is a Bun app that serves
 * your MCP server at /mcp.
 */

import { type DefaultEnv, withRuntime } from "@decocms/runtime";
import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import {
	StateSchema as BaseStateSchema,
	type Env as DecoEnv,
} from "../shared/deco.gen.ts";

/**
 * StateSchema with MCP Registry configuration.
 * Users can customize the registry URL when installing the MCP.
 */
export const StateSchema = BaseStateSchema.extend({
	MCPS: z.array(
		z.object({
			value: z.string(),
			tools: z.array(z.string()),
			__type: z.literal("*").default("*"),
		}),
	),
});

/**
 * This Env type is the main context object that is passed to
 * all of your Application.
 *
 * It includes all of the generated types from your
 * Deco bindings, along with the default ones.
 */
export type Env = DefaultEnv<typeof StateSchema> & DecoEnv;

const runtime = withRuntime<Env, typeof StateSchema>({
	configuration: {
		/**
		 * These scopes define the asking permissions of your
		 * app when a user is installing it. When a user
		 * authorizes your app for using AI_GENERATE, you will
		 * now be able to use `env.AI_GATEWAY.AI_GENERATE`
		 * and utilize the user's own AI Gateway, without having to
		 * deploy your own, setup any API keys, etc.
		 */
		scopes: [],
		/**
		 * The state schema of your Application defines what
		 * your installed App state will look like. When a user
		 * is installing your App, they will have to fill in
		 * a form with the fields defined in the state schema.
		 *
		 * This is powerful for building multi-tenant apps,
		 * where you can have multiple users and projects
		 * sharing different configurations on the same app.
		 *
		 * When you define a binding dependency on another app,
		 * it will automatically be linked to your StateSchema on
		 * type generation. You can also `.extend` it to add more
		 * fields to the state schema, like asking for an API Key
		 * for connecting to a third-party service.
		 */
		state: StateSchema,
	},
	tools: async (env: Env) => {
		if (!env.MCPS) {
			return [];
		}
		const toolList = await Promise.all(
			env.MCPS.flatMap(async (mcp) => {
				const tools = await mcp.$listTools();
				return tools.map((tool) => createPrivateTool(tool));
			}),
		);
		return toolList.flat();
	},
	bindings: [
		{
			type: "mcp",
			name: "MCPS",
			array: true,
			app_name: "*",
		},
	],
});

const server = {
	fetch: (req: Request) => {
		if (new URL(req.url).pathname === "/_healthcheck") {
			return new Response("OK", { status: 200 });
		}
		return runtime.fetch(req, { ...process.env } as Env, {});
	},
};

export default server;
