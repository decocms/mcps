import { BindingOf, type DefaultEnv, withRuntime } from "@decocms/runtime";
import { tools } from "./tools/index.ts";
import { ensureCollections, ensureIndexes } from "./collections/index.ts";
import { insertDefaultWorkflowIfNotExists } from "./tools/workflow/workflow.ts";
import { ensureAgentsTable } from "./lib/postgres.ts";
import { EventBusBindingClient } from "@decocms/bindings";
import { executeWorkflow } from "./workflow/executor.ts";
import { sendSignal } from "./workflow/events.ts";
import z from "zod";

export const StateSchema = z.object({
  DATABASE: BindingOf("@deco/postgres"),
  EVENT_BUS: BindingOf("@deco/event-bus"),
});

export type Env = DefaultEnv<typeof StateSchema> & {
  DATABASE: {
    DATABASES_RUN_SQL: (params: {
      sql: string;
      params: unknown[];
    }) => Promise<{ result: { results: unknown[] }[] }>;
  };
  EVENT_BUS: EventBusBindingClient;
};

async function handleEvents(
  events: { type: string; data?: unknown; subject?: string; id: string }[],
  env: Env,
) {
  for (const event of events) {
    if (event.type === "workflow.execution.created" && event.subject) {
      await executeWorkflow(env, event.subject).catch((error: Error) => {
        console.error(`[EXECUTE_WORKFLOW] Error executing workflow: ${error}`);
      });
    }

    if (event.type === "timer.scheduled") {
      const data = event.data as {
        executionId: string;
        stepName: string;
        wakeAtEpochMs: number;
      };
      await executeWorkflow(env, data.executionId).catch((error: Error) => {
        console.error(`[EXECUTE_WORKFLOW] Error executing workflow: ${error}`);
      });
    }

    if (event.type === "workflow.signal.sent" && event.subject) {
      try {
        sendSignal(
          env,
          event.subject,
          (event.data as { signalName: string; payload: unknown }).signalName,
          (event.data as { signalName: string; payload: unknown }).payload,
        );
      } catch (error) {
        console.error(`[EXECUTE_WORKFLOW] Error sending signal: ${error}`);
      }
    }
  }
  return { success: true };
}

const runtime = withRuntime<Env, typeof StateSchema>({
  events: {
    handlers: {
      events: [
        "workflow.execution.created",
        "workflow.signal.sent",
        "timer.scheduled",
      ],
      handler: async ({ events }, env) => {
        handleEvents(events, {
          ...env,
          ...(env as unknown as Env).MESH_REQUEST_CONTEXT?.state,
        } as unknown as Env).catch((error: Error) => {
          console.error(`[MAIN] Error handling events: ${error}`);
        });
        return { success: true };
      },
    },
  },
  configuration: {
    onChange: async (env) => {
      const state = env.MESH_REQUEST_CONTEXT.state;
      try {
        await ensureAgentsTable({ ...env, ...state } as unknown as Env);
        await ensureCollections({ ...env, ...state } as unknown as Env);
        await ensureIndexes({ ...env, ...state } as unknown as Env);
        await insertDefaultWorkflowIfNotExists({
          ...env,
          ...state,
        } as unknown as Env);
      } catch (error) {
        console.error("error changing configuration", error);
      }
    },
    scopes: ["DATABASE::DATABASES_RUN_SQL", "EVENT_BUS::*"],
    state: StateSchema,
  },
  tools: (env: Env) =>
    tools.map((tool) =>
      tool({ ...env, ...env.MESH_REQUEST_CONTEXT.state } as unknown as Env),
    ),
});

export default runtime;
