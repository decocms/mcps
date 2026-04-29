import { createTriggers } from "@decocms/runtime/triggers";
import { StudioKV } from "@decocms/runtime/trigger-storage";
import { z } from "zod";

let instance: ReturnType<typeof createTriggers> | undefined;

function getTriggers(): ReturnType<typeof createTriggers> {
  if (instance) return instance;

  const storage =
    process.env.MESH_URL && process.env.MESH_API_KEY
      ? new StudioKV({
          url: process.env.MESH_URL,
          apiKey: process.env.MESH_API_KEY,
        })
      : undefined;

  instance = createTriggers({
    definitions: [
      {
        type: "gmail.message.received",
        description: "Triggered when a new email is received",
        params: z.object({}),
      },
    ],
    storage,
  });

  return instance;
}

export const triggers = {
  tools: () => getTriggers().tools(),
  notify: (...args: Parameters<ReturnType<typeof createTriggers>["notify"]>) =>
    getTriggers().notify(...args),
};
