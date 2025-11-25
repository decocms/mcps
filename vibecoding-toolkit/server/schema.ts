/**
 * This file is used to define the schema for the database.
 *
 * After making changes to this file, run `npm run db:generate` to generate the migration file.
 * Then, by just using the app, the migration is lazily ensured at runtime.
 */
import { sqliteTable, text } from "@decocms/runtime/drizzle";

export const agentsTable = sqliteTable("agents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  created_by: text("created_by"),
  updated_by: text("updated_by"),
  description: text("description").notNull(),
  instructions: text("instructions").notNull(),
  toolSet: text("toolSet").notNull(),
});
