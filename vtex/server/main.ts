/**
 * VTEX Commerce MCP
 *
 * MCP for VTEX Commerce APIs - Catalog, Orders, and Logistics/Inventory.
 */
import { withRuntime } from "@decocms/runtime";
import {
  ordersSalesCardResource,
  ordersTimelineResource,
} from "./resources/index.ts";
import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";
import packageJson from "../package.json" with { type: "json" };

console.log(`VTEX Commerce MCP v${packageJson.version}`);

export type { Env };
export { StateSchema };

// biome-ignore lint/suspicious/noExplicitAny: runtime.fetch signature compatibility
type Fetcher = (req: Request, ...args: any[]) => Response | Promise<Response>;

function withMcpApiRoute(fetcher: Fetcher): Fetcher {
  return (req: Request, ...args) => {
    const url = new URL(req.url);

    if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) {
      return new Response("Not Found", { status: 404 });
    }

    if (url.pathname === "/api/mcp" || url.pathname.startsWith("/api/mcp/")) {
      url.pathname = url.pathname.slice(4);
      const rewrittenReq = new Request(url.toString(), req);
      return fetcher(rewrittenReq, ...args);
    }

    return fetcher(req, ...args);
  };
}

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    state: StateSchema,
  },
  tools,
  resources: [ordersTimelineResource, ordersSalesCardResource],
});

const PORT = Number(process.env.PORT) || 3001;

Bun.serve({
  idleTimeout: 0,
  hostname: "0.0.0.0",
  port: PORT,
  fetch: withMcpApiRoute(runtime.fetch),
});

console.log("");
console.log(`MCP App: http://localhost:${PORT}/api/mcp`);
console.log("");
