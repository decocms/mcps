/** Debug/ops tools. */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { runTickOnce } from "../engine/worker.ts";
import type { Env } from "../types/env.ts";

export const createAdvanceQueueTool = (_env: Env) =>
  createPrivateTool({
    id: "ADVANCE_QUEUE",
    description:
      "Force one worker tick right now (the queue also advances automatically every 30s). Useful for debugging.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      connections: z.number(),
      advanced: z.number(),
    }),
    execute: async () => {
      return await runTickOnce();
    },
  });
