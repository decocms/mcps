import { z } from "zod";

export const fileKeySchema = z

  .string()

  .describe(
    "Figma link (figma.com/design|file|proto|board/...) or bare file key. A ?node-id=… in the link selects the node.",
  );

export const nodeIdSchema = z

  .string()

  .optional()

  .describe(
    'Node id like "2652:13291" or "2652-13291". Defaults to the node-id in the link.',
  );

export const text = (value: string) => ({
  content: [{ type: "text" as const, text: value }],
});
