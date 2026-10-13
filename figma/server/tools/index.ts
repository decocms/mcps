import { createPrivateTool, createPrompt } from "@decocms/runtime/tools";
import { z } from "zod";
import { figmaFetch, tokenFrom } from "../lib/figma.ts";
import {
  addCodeConnectMapTool,
  getCodeConnectMapTool,
  getCodeConnectSuggestionsTool,
  getContextForCodeConnectTool,
} from "./code-connect.ts";
import {
  downloadAssetsTool,
  getCommentsTool,
  getDesignContextTool,
  getFigjamTool,
  getMetadataTool,
  getMotionContextTool,
  getScreenshotTool,
  getVariableDefsTool,
} from "./design.ts";
import { getLibrariesTool, searchDesignSystemTool } from "./library.ts";

const whoamiTool = createPrivateTool({
  id: "whoami",
  description:
    "The Figma account this connection uses. Files it cannot open are invisible to every other tool.",
  inputSchema: z.object({}),
  execute: async ({ runtimeContext }) => {
    const me = await figmaFetch<{
      id: string;
      handle: string;
      email: string;
      img_url: string;
    }>(tokenFrom(runtimeContext), "/v1/me");
    return { id: me.id, handle: me.handle, email: me.email };
  },
});

export const tools = [
  getDesignContextTool,
  getMetadataTool,
  getScreenshotTool,
  downloadAssetsTool,
  getVariableDefsTool,
  getMotionContextTool,
  getFigjamTool,
  getCommentsTool,
  getLibrariesTool,
  searchDesignSystemTool,
  getCodeConnectMapTool,
  addCodeConnectMapTool,
  getCodeConnectSuggestionsTool,
  getContextForCodeConnectTool,
  whoamiTool,
];

export const prompts = [
  createPrompt({
    name: "create_design_system_rules",
    title: "Create design system rules",
    description:
      "Write a rules file that tells coding agents how this repo implements Figma designs.",
    argsSchema: {
      fileKey: z
        .string()
        .optional()
        .describe("A Figma file or link that uses the design system."),
      clientFrameworks: z.string().optional(),
      clientLanguages: z.string().optional(),
    },
    execute: ({ args }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "Write design-system rules for this repository so future agents implement Figma designs consistently.",
              args.clientFrameworks || args.clientLanguages
                ? `Stack: ${[args.clientFrameworks, args.clientLanguages].filter(Boolean).join(" / ")}.`
                : "Detect the stack from the repository.",
              "",
              "1. Inspect the codebase: where tokens live (CSS variables, Tailwind theme, theme files), the component library and its folder,",
              "   the styling approach, icon and image handling, and breakpoints.",
              args.fileKey
                ? `2. Inspect the design system in Figma (${args.fileKey}): get_libraries, then search_design_system for core pieces (button, input, card, typography, colors) and get_variable_defs on a representative frame.`
                : "2. If a Figma file is available, inspect its libraries with get_libraries, search_design_system and get_variable_defs.",
              "3. Use get_code_connect_map / get_code_connect_suggestions to see which Figma components already map to code.",
              "4. Write the rules (append to the repo's agent instructions file, e.g. AGENTS.md or CLAUDE.md) covering:",
              "   - Figma token or style → code token mapping, and the rule never to hardcode a value that has a token;",
              "   - Figma component → code component mapping, and the rule to reuse mapped components;",
              "   - how to turn get_design_context output (flexbox CSS, fill/hug sizing) into this stack's idioms;",
              "   - where exported assets go (download_assets) and the formats to use;",
              "   - verification: screenshot the implementation at the frame's viewport and compare it with get_screenshot before finishing.",
              "Keep the rules short, concrete and specific to this repo.",
            ].join("\n"),
          },
        },
      ],
    }),
  }),
];
