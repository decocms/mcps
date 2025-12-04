/**
 * OpenRouter MCP Server
 *
 * This MCP provides tools for interacting with OpenRouter's API,
 * including model discovery, comparison, and AI chat completions.
 *
 * OpenRouter offers a unified API for accessing hundreds of AI models
 * with built-in fallback mechanisms, cost optimization, and provider routing.
 */
import { type DefaultEnv, withRuntime } from "@decocms/runtime";
import { z } from "zod";
import {
  StateSchema as BaseStateSchema,
  type Env as DecoEnv,
  Scopes,
} from "../shared/deco.gen.ts";

import { tools } from "./tools/index.ts";
/**
 * State Schema defines the configuration users provide during installation
 */
export const StateSchema = BaseStateSchema.partial({ OPENROUTER_CONTRACT: true }).extend({
	OPENROUTER_API_KEY: z.string().optional(),
});

/**
 * Environment type combining Deco bindings and Cloudflare Workers context
 */
export type Env = DefaultEnv<typeof StateSchema> &
	DecoEnv & {
		ASSETS: {
			fetch: (request: Request, init?: RequestInit) => Promise<Response>;
		};
		OPENROUTER_API_KEY: string;
		WALLET_VENDOR_ID: string;
		state: z.infer<typeof StateSchema>;
	};

const runtime = withRuntime<Env, typeof StateSchema>({
	configuration: {
		scopes: [
			Scopes.OPENROUTER_CONTRACT.CONTRACT_AUTHORIZE,
			Scopes.OPENROUTER_CONTRACT.CONTRACT_SETTLE,
		],
		state: StateSchema,
	},
	tools,

	/**
	 * Custom fetch handler for API routes and assets
	 * Handles streaming endpoints and other custom routes
	 */
	fetch: async (req: Request, env: Env) => {
		return env.ASSETS.fetch(req);
	},
});

export default runtime;
