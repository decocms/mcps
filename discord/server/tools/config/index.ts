import { createSaveConfigTool } from "./save.ts";
import { createGetConfigTool } from "./get.ts";
import { createDeleteConfigTool } from "./delete.ts";

export const configTools = [
  createSaveConfigTool,
  createGetConfigTool,
  createDeleteConfigTool,
];
