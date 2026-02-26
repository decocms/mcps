/**
 * Environment Types & State Schema
 *
 * Defines the runtime environment type and the MCP state schema.
 * Optional integrations configured here:
 * - AIRTABLE_CONFIG: pull billing/contacts data directly from Airtable
 * - LLM_CONFIG: AI enrichment for summary generation (OpenAI, Anthropic,
 *   Gemini, DeepSeek, Groq)
 */

import type { DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  AIRTABLE_CONFIG: z
    .object({
      api_key: z
        .string()
        .describe("Airtable personal access token (pat...)."),
      base_id: z
        .string()
        .describe("Airtable Base ID (appXXXXXXXXXXXXXX)."),
      billing_table: z
        .string()
        .default("billing")
        .describe("Name of the billing table in Airtable."),
      contacts_table: z
        .string()
        .default("contacts")
        .describe("Name of the contacts table in Airtable."),
    })
    .optional()
    .describe("Airtable integration. When set, airtable_sync pulls billing and contacts data directly from your Airtable base."),

  LLM_CONFIG: z
    .object({
      provider: z
        .enum([
          "openai",
          "gemini",
          "anthropic",
          "deepseek",
          "groq"
        ])
        .default("openai")
        .describe("AI provider for summary generation."),

      api_key: z
        .string()
        .describe("Your secret API key (keep it secure)."),

      model: z
        .string()
        .default("gpt-4o-mini")
        .describe(
          "Model ID. Examples: 'claude-3-5-sonnet-latest', 'deepseek-chat', 'gpt-4o', 'gemini-1.5-flash', 'meta-llama/llama-3.1-70b'."
        ),

      max_tokens: z
        .number()
        .default(2000)
        .describe("Token limit for AI responses. Reasoning models (gpt-5) use extra tokens internally, so use higher values (1500+)."),
    })
    .optional()
    .describe("AI configuration for financial analysis enrichment."),
});

export type Env = DefaultEnv<typeof StateSchema>;
