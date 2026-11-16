import { importTool, registerTool, uploadChunkTool } from "./import.ts";
import {
  deleteFileTool,
  getNodeTool,
  getPagesTool,
  getStylesTool,
  getTextsTool,
  listFilesTool,
  searchTool,
} from "./read.ts";

export const tools = [
  importTool,
  uploadChunkTool,
  registerTool,
  listFilesTool,
  getPagesTool,
  getNodeTool,
  searchTool,
  getTextsTool,
  getStylesTool,
  deleteFileTool,
];
