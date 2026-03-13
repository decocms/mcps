import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { getAccessToken } from "../lib/env.ts";
import { AirtableClient } from "../lib/airtable-client.ts";

export const createCreateFieldTool = (env: Env) =>
  createPrivateTool({
    id: "airtable_create_field",
    description: "Create a new field in an Airtable table.",
    inputSchema: z.object({
      baseId: z.string().describe("The ID of the base."),
      tableId: z.string().describe("The ID of the table."),
      name: z.string().describe("Name of the new field."),
      type: z
        .string()
        .describe("Field type (e.g., singleLineText, number, singleSelect)."),
      description: z.string().optional().describe("Description of the field."),
      options: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Field-type-specific options."),
    }),
    execute: async ({ context }) => {
      const client = new AirtableClient(getAccessToken(env));
      return await client.createField(context.baseId, context.tableId, {
        name: context.name,
        type: context.type,
        description: context.description,
        options: context.options,
      });
    },
  });

export const createUpdateFieldTool = (env: Env) =>
  createPrivateTool({
    id: "airtable_update_field",
    description:
      "Update the name or description of an existing field in an Airtable table.",
    inputSchema: z.object({
      baseId: z.string().describe("The ID of the base."),
      tableId: z.string().describe("The ID of the table."),
      fieldId: z.string().describe("The ID of the field to update."),
      name: z.string().optional().describe("New name for the field."),
      description: z
        .string()
        .optional()
        .describe("New description for the field."),
    }),
    execute: async ({ context }) => {
      const client = new AirtableClient(getAccessToken(env));
      return await client.updateField(
        context.baseId,
        context.tableId,
        context.fieldId,
        {
          name: context.name,
          description: context.description,
        },
      );
    },
  });
