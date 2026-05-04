import { createBotStatusTool } from "./status.ts";
import { createBotStopTool } from "./stop.ts";

export const botTools = [createBotStatusTool, createBotStopTool];
