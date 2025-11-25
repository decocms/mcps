import { BaseCollectionEntitySchema } from "@decocms/bindings/collections";
import { z } from "zod";
import { createCollectionTools } from "../lib/createCollectionTools.ts";
import { agentsTable } from "../schema.ts";
import { getDb } from "../db.ts";

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
