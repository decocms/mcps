/**
 * Vibecoding Toolkit - Main Entry Point
 *
 * This is the main entry point for the Vibecoding Toolkit MCP server.
 * Built on Cloudflare Workers, it serves:
 * - MCP server at /mcp
 * - React application views at /
 * - Workflow queue handler for durable execution
 * - Cron-based orphan recovery for stuck workflows
 *
 * ## Scheduler Architecture
 *
 * The toolkit uses a pluggable scheduler architecture for workflow execution:
 * - **Serverless (Cloudflare Workers)**: QueueScheduler with cron-based recovery
 * - **Traditional Servers (Node.js)**: PollingScheduler with adaptive intervals
 *
 * @see docs/SCHEDULER_ARCHITECTURE.md for full design
 * @see server/scheduler/ for scheduler implementations
 */
import { DefaultEnv, withRuntime } from "@decocms/runtime";
import {
  type Env as DecoEnv,
  Scopes,
  StateSchema,
} from "../shared/deco.gen.ts";

import { tools } from "./tools/index.ts";
import { views } from "./views.ts";
import { MessageBatch, Queue } from "@cloudflare/workers-types";
import { handleWorkflowQueue } from "./queue-handler.ts";
import { QueueMessage } from "./collections/workflow.ts";

// Re-export scheduler module for external use
export * from "./scheduler/index.ts";

// Re-export library utilities
export * from "./lib/index.ts";

/**
 * This Env type is the main context object that is passed to
 * all of your Application.
 *
 * It includes all of the generated types from your
 * Deco bindings, along with the default ones.
 */
export type Env = DefaultEnv &
  DecoEnv & {
    ASSETS: {
      fetch: (request: Request, init?: RequestInit) => Promise<Response>;
    };
    POSTGRES: {
      RUN_SQL: (params: {
        query: string;
        params: any[];
      }) => Promise<{ rows: any[]; rowCount: number }>;
    };
    WORKFLOW_QUEUE: Queue<any>;
  };

const runtime = withRuntime<Env, typeof StateSchema>({
  oauth: {
    /**
     * These scopes define the asking permissions of your
     * app when a user is installing it. When a user
     * authorizes your app for using AI_GENERATE, you will
     * now be able to use `env.AI_GATEWAY.AI_GENERATE`
     * and utilize the user's own AI Gateway, without having to
     * deploy your own, setup any API keys, etc.
     */
    scopes: Object.values(Scopes).flatMap((scope) => Object.values(scope)),
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
  views,
  tools,
  /**
   * Fallback directly to assets for all requests that do not match a tool or auth.
   * If you wanted to add custom api routes that dont make sense to be a tool,
   * you can add them on this handler.
   */
  fetch: (req, env) => env.ASSETS.fetch(req),
});

export default {
  ...runtime,

  /**
   * Queue handler for workflow execution.
   * Processes workflow messages from Cloudflare Queues.
   */
  async queue(batch: MessageBatch<QueueMessage>, env: Env) {
    await handleWorkflowQueue(batch, env);
  },

  /**
   * Scheduled handler for orphan recovery.
   * Runs on a cron schedule to recover stuck workflows.
   *
   * Uses internal HTTP call to the MCP tool endpoint. Since cron handlers
   * run with the worker's bindings, we can construct a request and route it
   * through the runtime.
   *
   * To enable cron, add to wrangler.toml:
   *   [triggers]
   *   crons = ["*\/5 * * * *"]  (every 5 minutes)
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log(`[CRON] Running orphan recovery (cron: ${event.cron})`);

    try {
      // Call the recovery tool via internal fetch
      // The runtime handler will process this as an MCP tool call
      const request = new Request(
        `${env.DECO_APP_ENTRYPOINT || "http://localhost:8787"}/mcp/call-tool/RECOVER_ORPHAN_EXECUTIONS`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Deco-MCP-Client": "true",
            // Cron jobs run without user auth - use internal service call
            "X-Deco-Internal-Cron": "true",
          },
          body: JSON.stringify({
            limit: 100,
            lockExpiryBufferMs: 60000,
            maxAgeMs: 24 * 60 * 60 * 1000,
          }),
        },
      );

      // Use waitUntil to ensure the request completes even if handler returns early
      ctx.waitUntil(
        (async () => {
          try {
            const response = await runtime.fetch!(
              request as any,
              env,
              ctx as any,
            );
            if (!response.ok) {
              console.error(
                `[CRON] Recovery failed: ${response.status} ${response.statusText}`,
              );
              return;
            }
            const result = await response.json();
            console.log(
              `[CRON] Recovery complete:`,
              JSON.stringify(result, null, 2),
            );
          } catch (error) {
            console.error("[CRON] Recovery error:", error);
          }
        })(),
      );
    } catch (error) {
      console.error("[CRON] Failed to initiate recovery:", error);
    }
  },
};

/**
 * Type definitions for Cloudflare scheduled events
 */
interface ScheduledEvent {
  cron: string;
  type: "scheduled";
  scheduledTime: number;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
