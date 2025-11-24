import {
  createCollectionBindings,
  BaseCollectionEntitySchema,
} from "@decocms/bindings/collections";
import { z } from "zod";
import { createPrivateTool as createTool } from "@decocms/runtime/mastra";

const AgentSchema = BaseCollectionEntitySchema.extend({
  description: z.string(),
  instructions: z.string(),
  toolSet: z.record(z.string(), z.array(z.string())),
});
