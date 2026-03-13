import type { Env } from "../main.ts";
import { createWhoamiTool } from "./auth.ts";
import { createListBasesTool, createGetBaseSchemaTool } from "./bases.ts";
import {
  createListRecordsTool,
  createGetRecordTool,
  createSearchRecordsTool,
  createCreateRecordsTool,
  createUpdateRecordsTool,
  createDeleteRecordsTool,
} from "./records.ts";
import { createCreateTableTool, createUpdateTableTool } from "./tables.ts";
import { createCreateFieldTool, createUpdateFieldTool } from "./fields.ts";

export const tools = (env: Env) => [
  createWhoamiTool(env),
  createListBasesTool(env),
  createGetBaseSchemaTool(env),
  createListRecordsTool(env),
  createGetRecordTool(env),
  createSearchRecordsTool(env),
  createCreateRecordsTool(env),
  createUpdateRecordsTool(env),
  createDeleteRecordsTool(env),
  createCreateTableTool(env),
  createUpdateTableTool(env),
  createCreateFieldTool(env),
  createUpdateFieldTool(env),
];
