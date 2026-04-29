/**
 * Dropbox MCP tool registry — all tools are static (no upstream discovery).
 */

import { getCurrentAccountTool, getSpaceUsageTool } from "./account.ts";
import {
  copyTool,
  createFolderTool,
  deleteTool,
  downloadFileTool,
  getMetadataTool,
  getTemporaryLinkTool,
  listFolderTool,
  listRevisionsTool,
  moveTool,
  restoreTool,
  searchTool,
  uploadFileTool,
} from "./files.ts";
import {
  addFolderMemberTool,
  createSharedLinkTool,
  listSharedLinksTool,
  shareFolderTool,
} from "./sharing.ts";

export const tools = [
  // Files & folders
  listFolderTool,
  searchTool,
  getMetadataTool,
  downloadFileTool,
  getTemporaryLinkTool,
  uploadFileTool,
  createFolderTool,
  moveTool,
  copyTool,
  deleteTool,
  restoreTool,
  listRevisionsTool,
  // Sharing
  createSharedLinkTool,
  listSharedLinksTool,
  shareFolderTool,
  addFolderMemberTool,
  // Account
  getCurrentAccountTool,
  getSpaceUsageTool,
];
