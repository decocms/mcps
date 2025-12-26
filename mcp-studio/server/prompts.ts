/**
 * MCP Prompts Loader
 *
 * Fetches prompts from the database and converts them to MCP prompts
 * that can be exposed via the MCP server.
 */

import { createPrompt, type GetPromptResult } from "@decocms/runtime";
import { z } from "zod";
import { runSQL } from "./lib/postgres.ts";
import type { Env } from "./main.ts";

interface StoredPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

interface StoredPromptMessage {
  role: "user" | "assistant";
  content: {
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
    resource?: {
      uri: string;
      mimeType?: string;
      text?: string;
      blob?: string;
    };
  };
}

interface StoredPrompt {
  id: string;
  title: string;
  description: string | null;
  arguments: StoredPromptArgument[];
  messages: StoredPromptMessage[];
}

/**
 * Load prompts from the database
 */
async function loadPrompts(env: Env): Promise<StoredPrompt[]> {
  if (!env.DATABASE) {
    return [];
  }

  try {
    return await runSQL<StoredPrompt>(
      env,
      "SELECT id, title, description, arguments, messages FROM prompts",
    );
  } catch (error) {
    console.error("Error fetching prompts:", error);
    return [];
  }
}

/**
 * Load prompts from the database and convert them to MCP prompts
 */
export async function createPrompts(env: Env) {
  const rows = await loadPrompts(env);

  return rows.map((row) => {
    // Build argsSchema from the prompt's arguments definition
    const argsShape: Record<string, z.ZodString | z.ZodOptional<z.ZodString>> =
      {};
    for (const arg of row.arguments || []) {
      const schema = z.string().describe(arg.description || arg.name);
      argsShape[arg.name] = arg.required ? schema : schema.optional();
    }

    return createPrompt({
      name: row.id,
      title: row.title || undefined,
      description: row.description || undefined,
      argsSchema: Object.keys(argsShape).length > 0 ? argsShape : undefined,
      execute: ({ args }): GetPromptResult => {
        // Replace {{argName}} placeholders in message text with actual values
        const messages = (row.messages || []).map((msg) => {
          if (msg.content.type === "text" && msg.content.text) {
            let text = msg.content.text;
            for (const [key, value] of Object.entries(args)) {
              if (value) {
                text = text.replace(
                  new RegExp(`\\{\\{${key}\\}\\}`, "g"),
                  value,
                );
              }
            }
            return {
              role: msg.role,
              content: { type: "text" as const, text },
            };
          }
          return msg;
        });

        return {
          description: row.description || undefined,
          messages: messages as GetPromptResult["messages"],
        };
      },
    });
  });
}
