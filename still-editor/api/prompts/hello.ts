import { createPublicPrompt } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";

export const helloPrompt = (_env: Env) =>
  createPublicPrompt({
    name: "hello",
    title: "Say Hello",
    description:
      "Greet someone using the hello_world tool. Provide a name and the tool will return a friendly greeting.",
    argsSchema: {
      name: z.string().describe("The name of the person to greet"),
    },
    execute: async ({ args }) => {
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Please use the hello_world tool to greet ${args.name ?? "World"}.`,
            },
          },
        ],
      };
    },
  });
