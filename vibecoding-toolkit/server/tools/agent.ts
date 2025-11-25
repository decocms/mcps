import { BaseCollectionEntitySchema } from "@decocms/bindings/collections";
import { z } from "zod";
import { getDb } from "../db.ts";
import { createCollectionTools } from "../lib/createCollectionTools.ts";
import { agentsTable } from "../schema.ts";

// Agent schema extending BaseCollectionEntitySchema
const AgentSchema = BaseCollectionEntitySchema.extend({
  description: z.string(),
  instructions: z.string(),
  toolSet: z.string(), // JSON string representation of toolSet
});

export const agentTools = createCollectionTools(
  "agents",
  AgentSchema,
  agentsTable,
  getDb,
);
