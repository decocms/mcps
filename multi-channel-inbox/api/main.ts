import { withRuntime } from "@decocms/runtime";
import { ensureSchema } from "./db/schema.ts";
import { handleInboxEvents, INBOX_EVENTS } from "./events/handler.ts";
import { startGmailPolling } from "./ingestion/gmail.ts";
import { inboxAppResource } from "./resources/inbox.ts";
import { tools } from "./tools/index.ts";
import { type Env, StateSchema } from "./types/env.ts";

// biome-ignore lint/suspicious/noExplicitAny: runtime.fetch signature compatibility
type Fetcher = (req: Request, ...args: any[]) => Response | Promise<Response>;

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  GET: "\x1b[36m",
  POST: "\x1b[33m",
  PUT: "\x1b[35m",
  DELETE: "\x1b[31m",
  ok: "\x1b[32m",
  redirect: "\x1b[36m",
  clientError: "\x1b[33m",
  serverError: "\x1b[31m",
  mcp: "\x1b[35m",
  duration: "\x1b[90m",
  requestId: "\x1b[94m",
};

function getStatusColor(status: number): string {
  if (status >= 500) return colors.serverError;
  if (status >= 400) return colors.clientError;
  if (status >= 300) return colors.redirect;
  return colors.ok;
}

function getMethodColor(method: string): string {
  return colors[method as keyof typeof colors] || colors.reset;
}

const runtime = withRuntime<Env, typeof StateSchema>({
  events: {
    handlers: {
      EVENT_BUS: {
        events: [...INBOX_EVENTS] as string[],
        handler: async ({ events }: { events: any[] }, env: any) => {
          try {
            await handleInboxEvents(events, env as Env);
            return { success: true };
          } catch (error) {
            console.error(`[MAIN] Error handling events: ${error}`);
            return { success: false };
          }
        },
      },
    },
  },
  configuration: {
    onChange: async (env) => {
      try {
        await ensureSchema(env);
        startGmailPolling(env);
      } catch (error) {
        console.error("[MAIN] Error in onChange:", error);
      }
    },
    state: StateSchema,
  },
  tools,
  resources: [inboxAppResource],
});

function withLogging(fetcher: Fetcher): Fetcher {
  return async (req: Request, ...args) => {
    const start = performance.now();
    const method = req.method;
    const path = new URL(req.url).pathname;
    const requestId =
      req.headers.get("x-request-id") || crypto.randomUUID().slice(0, 8);

    const methodColor = getMethodColor(method);
    const reqIdStr = `${colors.requestId}${requestId.slice(0, 8)}${colors.reset}`;
    console.log(
      `${colors.dim}<-${colors.reset} ${methodColor}${method}${colors.reset} ${path} ${reqIdStr}`,
    );

    try {
      const response = await fetcher(req, ...args);
      const duration = (performance.now() - start).toFixed(1);
      const statusColor = getStatusColor(response.status);
      console.log(
        `${colors.dim}->${colors.reset} ${methodColor}${method}${colors.reset} ${path} ${reqIdStr} ${statusColor}${response.status}${colors.reset} ${colors.duration}${duration}ms${colors.reset}`,
      );
      return response;
    } catch (error) {
      const duration = (performance.now() - start).toFixed(1);
      console.log(
        `${colors.dim}->${colors.reset} ${methodColor}${method}${colors.reset} ${path} ${reqIdStr} ${colors.serverError}ERR${colors.reset} ${colors.duration}${duration}ms${colors.reset}`,
      );
      throw error;
    }
  };
}

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

Bun.serve({
  idleTimeout: 0,
  hostname: "0.0.0.0",
  port: PORT,
  fetch: withLogging(withMcpApiRoute(runtime.fetch)),
});

console.log(`MCP App server started on http://localhost:${PORT}`);
console.log(`- MCP endpoint: http://localhost:${PORT}/api/mcp`);
