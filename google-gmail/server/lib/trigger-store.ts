import { createTriggers } from "@decocms/runtime/triggers";
import { StudioKV } from "@decocms/runtime/trigger-storage";
import { z } from "zod";

const storage =
  process.env.MESH_URL && process.env.MESH_API_KEY
    ? new StudioKV({
        url: process.env.MESH_URL,
        apiKey: process.env.MESH_API_KEY,
      })
    : undefined;

export const triggers = createTriggers({
  definitions: [
    {
      type: "gmail.message.received",
      description: "Triggered when a new email is received",
      params: z.object({}),
    },
  ],
  storage,
});
