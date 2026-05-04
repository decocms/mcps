import { createInteractionFollowupTool } from "./respond.ts";
import { createInteractionUpdateTool } from "./update.ts";
import { createInteractionShowModalTool } from "./modal.ts";

export const interactionTools = [
  createInteractionFollowupTool,
  createInteractionUpdateTool,
  createInteractionShowModalTool,
];
