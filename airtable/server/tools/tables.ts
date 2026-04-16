import { createTool, ensureAuthenticated } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { getAccessToken } from "../lib/env.ts";
import { AirtableClient } from "../lib/airtable-client.ts";

const FieldOptionSchema = z
  .record(z.string(), z.unknown())
  .describe("Field-type-specific options (e.g., choices for select fields).");

export const createCreateTableTool = (env: Env) =>
  createTool({
    id: "airtable_create_table",
    description:
      "Create a new table in an Airtable base with specified fields.",
    inputSchema: z.object({
      baseId: z.string().describe("The ID of the base."),
      name: z.string().describe("Name of the new table."),
      description: z.string().optional().describe("Description of the table."),
      fields: z
        .array(
          z.object({
            name: z.string().describe("Field name."),
            type: z
              .string()
              .describe(
                "Field type (e.g., singleLineText, number, singleSelect).",
              ),
            description: z.string().optional().describe("Field description."),
            options: FieldOptionSchema.optional().describe(
              "Field options (e.g., choices for select fields).",
            ),
          }),
        )
        .min(1)
        .describe(
          "Array of fields for the table. At least one field is required.",
        ),
    }),
    execute: async ({ context }, ctx) => {
      ensureAuthenticated(ctx!);
      const client = new AirtableClient(getAccessToken(env));
      return await client.createTable(context.baseId, {
        name: context.name,
        description: context.description,
        fields: context.fields,
      });
    },
  });

export const createUpdateTableTool = (env: Env) =>
  createTool({
    id: "airtable_update_table",
    description:
      "Update the name or description of an existing Airtable table.",
    inputSchema: z
      .object({
        baseId: z.string().describe("The ID of the base."),
        tableId: z.string().describe("The ID of the table to update."),
        name: z.string().optional().describe("New name for the table."),
        description: z
          .string()
          .optional()
          .describe("New description for the table."),
      })
      .refine(
        ({ name, description }) =>
          name !== undefined || description !== undefined,
        {
          message:
            "Provide at least one field to update (name or description).",
        },
      ),
    execute: async ({ context }, ctx) => {
      ensureAuthenticated(ctx!);
      const client = new AirtableClient(getAccessToken(env));
      return await client.updateTable(context.baseId, context.tableId, {
        name: context.name,
        description: context.description,
      });
    },
  });
