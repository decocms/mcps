import type { Env } from "../main.ts";
import { fileTools } from "./files.ts";
import { commentTools } from "./comments.ts";
import { teamTools } from "./teams.ts";
import { createWhoamiTool } from "./user.ts";

export const tools = (env: Env) => [
  createWhoamiTool(env),
  ...fileTools.map((createTool) => createTool(env)),
  ...commentTools.map((createTool) => createTool(env)),
  ...teamTools.map((createTool) => createTool(env)),
];
