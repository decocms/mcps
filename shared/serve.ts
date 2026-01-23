/// <reference types="bun" />

/**
 * Shared Bun.serve utility for MCP servers
 *
 * This utility provides a consistent way to serve MCP applications
 * with the correct configuration for SSE endpoints and K8s compatibility.
 */

// Using 'any' for additional args to support both simple fetch handlers
// and runtime.fetch which expects (req, env, ctx)
// biome-ignore lint/suspicious/noExplicitAny: Required for compatibility with runtime.fetch signature
type Fetcher = (req: Request, ...args: any[]) => Response | Promise<Response>;

// ANSI color codes
const colors = {
	reset: "\x1b[0m",
	dim: "\x1b[2m",
	bold: "\x1b[1m",
	// Methods
	GET: "\x1b[36m", // cyan
	POST: "\x1b[33m", // yellow
	PUT: "\x1b[35m", // magenta
	DELETE: "\x1b[31m", // red
	// Status
	ok: "\x1b[32m", // green
	redirect: "\x1b[36m", // cyan
	clientError: "\x1b[33m", // yellow
	serverError: "\x1b[31m", // red
	// Special
	mcp: "\x1b[35m", // magenta
	duration: "\x1b[90m", // gray
	requestId: "\x1b[94m", // bright blue
};

const getStatusColor = (status: number) => {
	if (status >= 500) return colors.serverError;
	if (status >= 400) return colors.clientError;
	if (status >= 300) return colors.redirect;
	return colors.ok;
};

const getMethodColor = (method: string) =>
	colors[method as keyof typeof colors] || colors.reset;

/**
 * Wraps a fetch handler with request logging
 */
function withLogging(fetcher: Fetcher): Fetcher {
	return async (req: Request, ...args) => {
		const start = performance.now();
		const method = req.method;
		const url = new URL(req.url);
		const path = url.pathname;

		// Get request ID from upstream or generate one
		const requestId =
			req.headers.get("x-request-id") || crypto.randomUUID().slice(0, 8);

		// Format path for MCP connections
		let displayPath = path;
		if (path.startsWith("/mcp/conn_")) {
			const connId = path.split("/")[2] ?? "";
			displayPath = `/mcp/${colors.mcp}${connId.slice(0, 12)}…${colors.reset}`;
		} else if (path === "/mcp" || path.startsWith("/mcp")) {
			displayPath = `${colors.mcp}${path}${colors.reset}`;
		}

		const methodColor = getMethodColor(method);
		const reqIdStr = `${colors.requestId}${requestId.slice(0, 8)}${colors.reset}`;

		// Log incoming request
		console.log(
			`${colors.dim}←${colors.reset} ${methodColor}${method}${colors.reset} ${displayPath} ${reqIdStr}`,
		);

		let response: Response;
		try {
			response = await fetcher(req, ...args);
		} catch (error) {
			const duration = (performance.now() - start).toFixed(1);
			console.log(
				`${colors.dim}→${colors.reset} ${methodColor}${method}${colors.reset} ${displayPath} ${reqIdStr} ${colors.serverError}ERR${colors.reset} ${colors.duration}${duration}ms${colors.reset}`,
			);
			throw error;
		}

		const duration = (performance.now() - start).toFixed(1);
		const status = response.status;
		const statusColor = getStatusColor(status);

		console.log(
			`${colors.dim}→${colors.reset} ${methodColor}${method}${colors.reset} ${displayPath} ${reqIdStr} ${statusColor}${status}${colors.reset} ${colors.duration}${duration}ms${colors.reset}`,
		);

		return response;
	};
}

/**
 * Starts a Bun server with the provided fetch handler.
 *
 * Configures the server with:
 * - idleTimeout: 0 (required for SSE endpoints like notifications)
 * - hostname: 0.0.0.0 (required for K8s)
 * - port: process.env.PORT or 8001
 * - development mode based on NODE_ENV
 *
 * @param fetcher - The fetch handler function
 */
export function serve(fetcher: Fetcher) {
	Bun.serve({
		// This was necessary because MCP has SSE endpoints (like notification) that disconnects after 10 seconds (default bun idle timeout)
		idleTimeout: 0,
		port: process.env.PORT || 8001,
		hostname: "0.0.0.0", // Listen on all network interfaces (required for K8s)
		fetch: withLogging(fetcher),
		development: process.env.NODE_ENV !== "production",
	});
}
