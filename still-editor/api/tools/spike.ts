// Spike: checks the connections the app depends on from where it is deployed.
// Removed once the real tools land.
import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { callConnectionTool } from "../lib/connection.ts";
import type { Env } from "../types/env.ts";

const checkSchema = z.object({
  ok: z.boolean(),
  ms: z.number(),
  detail: z.string(),
});

async function check(run: () => Promise<string>) {
  const start = performance.now();
  try {
    const detail = await run();
    return { ok: true, ms: Math.round(performance.now() - start), detail };
  } catch (error) {
    return {
      ok: false,
      ms: Math.round(performance.now() - start),
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export const spikeCheckTool = (env: Env) =>
  createPrivateTool({
    id: "spike_check",
    description:
      "Spike: checks the OpenRouter, Wake (storefront and admin) and object storage connections.",
    inputSchema: z.object({
      productId: z.number().int().describe("A Wake product id to read"),
    }),
    outputSchema: z.object({
      openrouter: checkSchema,
      wakeStorefront: checkSchema,
      wakeAdmin: checkSchema,
      storage: checkSchema,
    }),
    execute: async ({ context }) => {
      const [openrouter, wakeStorefront, wakeAdmin, storage] =
        await Promise.all([
          check(async () => {
            const result = (await callConnectionTool(
              env,
              "OPENROUTER",
              "COLLECTION_LLM_LIST",
              { limit: 1 },
            )) as { items?: unknown[] };
            return `${result?.items?.length ?? 0} model(s) listed`;
          }),
          check(async () => {
            const result = (await callConnectionTool(
              env,
              "WAKE",
              "WAKE_GET_PRODUCT",
              { productId: context.productId },
            )) as Record<string, unknown>;
            return `product keys: ${Object.keys(result ?? {})
              .slice(0, 5)
              .join(", ")}`;
          }),
          check(async () => {
            await callConnectionTool(
              env,
              "WAKE",
              "WAKE_LIST_ORDER_STATUSES",
              {},
            );
            return "admin token accepted from this host";
          }),
          check(async () => {
            const key = `still-editor/spike/${Date.now()}.txt`;
            const body = "still-editor spike";
            const put = (await callConnectionTool(
              env,
              "OBJECT_STORAGE",
              "PUT_PRESIGNED_URL",
              { key, contentType: "text/plain", expiresIn: 60 },
            )) as { url: string };
            const upload = await fetch(put.url, {
              method: "PUT",
              headers: { "Content-Type": "text/plain" },
              body,
            });
            if (!upload.ok) throw new Error(`PUT ${upload.status}`);
            const get = (await callConnectionTool(
              env,
              "OBJECT_STORAGE",
              "GET_PRESIGNED_URL",
              { key, expiresIn: 60 },
            )) as { url: string };
            const read = await (await fetch(get.url)).text();
            await callConnectionTool(env, "OBJECT_STORAGE", "DELETE_OBJECT", {
              key,
            });
            if (read !== body) throw new Error("read back a different body");
            return "write, read and delete worked";
          }),
        ]);
      return { openrouter, wakeStorefront, wakeAdmin, storage };
    },
  });

export const spikeSleepTool = (_env: Env) =>
  createPrivateTool({
    id: "spike_sleep",
    description:
      "Spike: waits the given seconds, to measure how long a tool call may take from each caller.",
    inputSchema: z.object({ seconds: z.number().min(1).max(290) }),
    outputSchema: z.object({ slept: z.number() }),
    execute: async ({ context }) => {
      await new Promise((resolve) =>
        setTimeout(resolve, context.seconds * 1000),
      );
      return { slept: context.seconds };
    },
  });
