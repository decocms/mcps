import { createTool } from "@decocms/runtime/tools";
import { embed } from "ai";
import { z } from "zod";
import { embeddingModel } from "../lib/mesh-provider";
import { supabase } from "../lib/supabase";
import type { Env } from "../types/env.ts";

export const vtexDocsSearch = (_env: Env) =>
  createTool({
    id: "VTEX_DOCS_SEARCH",
    description:
      "Search VTEX documentation using hybrid search (semantic + full-text). Returns relevant documentation chunks based on the query.",
    inputSchema: z.object({
      query: z.string().describe("The search query in natural language"),
      language: z
        .enum(["en", "pt-br"])
        .optional()
        .describe("Filter by language (optional)"),
      limit: z
        .number()
        .min(1)
        .max(20)
        .optional()
        .describe("Number of results to return (default: 5)"),
      semanticWeight: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe(
          "Weight for semantic search vs full-text (0-1, default: 0.5)",
        ),
    }),
    outputSchema: z.object({
      results: z.array(
        z.object({
          content: z.string(),
          title: z.string(),
          source: z.string(),
          section: z.string(),
          similarity: z.number(),
          ftsRank: z.number(),
          hybridScore: z.number(),
        }),
      ),
    }),
    execute: async ({ context }) => {
      const { query, language, limit = 5, semanticWeight = 0.5 } = context;

      const { embedding } = await embed({
        model: embeddingModel(),
        value: query,
      });

      const filter = language ? { language } : {};

      const { data, error } = await supabase.rpc("hybrid_search", {
        query_text: query,
        query_embedding: embedding,
        match_count: limit,
        rrf_k: 60,
        semantic_weight: semanticWeight,
        filter_metadata: filter,
      });

      if (error) {
        throw new Error(`Search failed: ${error.message}`);
      }

      const results = (data || []).map((doc: any) => ({
        content: doc.content,
        title: doc.metadata?.title || "Untitled",
        source: doc.metadata?.source || "",
        section: doc.metadata?.section || "",
        similarity: doc.similarity,
        ftsRank: doc.fts_rank || 0,
        hybridScore: doc.hybrid_score,
      }));

      return { results };
    },
  });
