/**
 * Embeddings Client
 *
 * OpenRouter-compatible embeddings client for generating text embeddings.
 * Supports any OpenAI-compatible embeddings API (OpenRouter, OpenAI, local endpoints, etc.)
 */

export interface EmbeddingsConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  dimensions?: number;
}

export interface EmbeddingsProvider {
  embed(texts: string[]): Promise<number[][]>;
  dimensions: number;
}

interface EmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * Creates an OpenRouter-compatible embeddings provider
 *
 * Works with:
 * - OpenRouter: https://openrouter.ai/api/v1
 * - OpenAI: https://api.openai.com/v1
 * - Local endpoints: http://localhost:11434/v1 (Ollama)
 * - Any OpenAI-compatible API
 */
export function createEmbeddingsProvider(
  config: EmbeddingsConfig,
): EmbeddingsProvider {
  const { baseUrl, apiKey, model, dimensions = 1536 } = config;

  // Normalize base URL (remove trailing slash)
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");

  return {
    dimensions,

    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) {
        return [];
      }

      const url = `${normalizedBaseUrl}/embeddings`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: texts,
          dimensions,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Embeddings API error (${response.status}): ${errorText}`,
        );
      }

      const result = (await response.json()) as EmbeddingResponse;

      // Sort by index to ensure correct order
      const sorted = result.data.sort((a, b) => a.index - b.index);
      return sorted.map((item) => item.embedding);
    },
  };
}

/**
 * Get embeddings config from environment variables
 */
export function getEmbeddingsConfigFromEnv(): EmbeddingsConfig {
  const baseUrl = process.env.EMBEDDINGS_BASE_URL;
  const apiKey = process.env.EMBEDDINGS_API_KEY;
  const model = process.env.EMBEDDINGS_MODEL;
  const dimensions = process.env.EMBEDDINGS_DIM
    ? parseInt(process.env.EMBEDDINGS_DIM, 10)
    : 1536;

  if (!baseUrl) {
    throw new Error("EMBEDDINGS_BASE_URL environment variable is required");
  }
  if (!apiKey) {
    throw new Error("EMBEDDINGS_API_KEY environment variable is required");
  }
  if (!model) {
    throw new Error("EMBEDDINGS_MODEL environment variable is required");
  }

  return { baseUrl, apiKey, model, dimensions };
}

/**
 * Singleton embeddings provider instance
 * Created lazily on first use
 */
let cachedProvider: EmbeddingsProvider | null = null;

export function getEmbeddingsProvider(): EmbeddingsProvider {
  if (!cachedProvider) {
    const config = getEmbeddingsConfigFromEnv();
    cachedProvider = createEmbeddingsProvider(config);
  }
  return cachedProvider;
}
