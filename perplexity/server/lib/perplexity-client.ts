import { fetch as undiciFetch, ProxyAgent } from "undici";
import { z } from "zod";
import { PERPLEXITY_BASE_URL } from "../constants.ts";
import { ChatCompletionResponseSchema, SearchResponseSchema } from "./types.ts";

// ============================================================================
// Types
// ============================================================================

export interface Message {
  role: string;
  content: string;
}

export interface ChatOptions {
  search_recency_filter?: string;
  search_domain_filter?: string[];
  search_context_size?: string;
  reasoning_effort?: string;
}

// ============================================================================
// Proxy-aware fetch
// ============================================================================

export function getProxyUrl(): string | undefined {
  return (
    process.env.PERPLEXITY_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    undefined
  );
}

export async function proxyAwareFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const proxyUrl = getProxyUrl();
  if (proxyUrl) {
    const proxyAgent = new ProxyAgent(proxyUrl);
    const response = await undiciFetch(url, {
      ...options,
      dispatcher: proxyAgent,
    } as Parameters<typeof undiciFetch>[1]);
    return response as unknown as Response;
  }
  return fetch(url, options);
}

// ============================================================================
// API Request
// ============================================================================

async function makeApiRequest(
  apiKey: string,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const parsed = parseInt(process.env.PERPLEXITY_TIMEOUT_MS || "", 10);
  const TIMEOUT_MS = Number.isNaN(parsed) ? 300000 : parsed;
  const url = `${PERPLEXITY_BASE_URL}/${endpoint}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await proxyAwareFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `Request timeout: Perplexity API did not respond within ${TIMEOUT_MS}ms. Consider increasing PERPLEXITY_TIMEOUT_MS.`,
      );
    }
    throw new Error(`Network error while calling Perplexity API: ${error}`);
  }

  clearTimeout(timeoutId);

  if (!response.ok) {
    let errorText: string;
    try {
      errorText = await response.text();
    } catch {
      errorText = "Unable to parse error response";
    }
    throw new Error(
      `Perplexity API error: ${response.status} ${response.statusText}\n${errorText}`,
    );
  }

  return response;
}

// ============================================================================
// SSE Stream Consumer (for sonar-deep-research)
// ============================================================================

export async function consumeSSEStream(
  response: Response,
): Promise<z.infer<typeof ChatCompletionResponseSchema>> {
  const body = response.body;
  if (!body) {
    throw new Error("Response body is null");
  }

  const reader = (body as unknown as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  const contentParts: string[] = [];
  let citations: string[] | undefined;
  let usage: Record<string, unknown> | undefined;
  let id: string | undefined;
  let model: string | undefined;
  let created: number | undefined;
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;
      const data = trimmed.slice("data:".length).trim();
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed.id) id = parsed.id;
        if (parsed.model) model = parsed.model;
        if (parsed.created) created = parsed.created;
        if (parsed.citations) citations = parsed.citations;
        if (parsed.usage) usage = parsed.usage;
        const delta = parsed.choices?.[0]?.delta;
        if (delta?.content) contentParts.push(delta.content);
      } catch {
        // Skip malformed JSON chunks
      }
    }
  }

  // Process any remaining buffer content after stream ends
  if (buffer.trim()) {
    const trimmed = buffer.trim();
    if (trimmed.startsWith("data:")) {
      const data = trimmed.slice("data:".length).trim();
      if (data && data !== "[DONE]") {
        try {
          const parsed = JSON.parse(data);
          if (parsed.id) id = parsed.id;
          if (parsed.model) model = parsed.model;
          if (parsed.created) created = parsed.created;
          if (parsed.citations) citations = parsed.citations;
          if (parsed.usage) usage = parsed.usage;
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) contentParts.push(delta.content);
        } catch {
          // Skip malformed final chunk
        }
      }
    }
  }

  return ChatCompletionResponseSchema.parse({
    choices: [
      {
        message: { content: contentParts.join("") },
        finish_reason: "stop",
        index: 0,
      },
    ],
    ...(citations && { citations }),
    ...(usage && { usage }),
    ...(id && { id }),
    ...(model && { model }),
    ...(created && { created }),
  });
}

// ============================================================================
// Strip thinking tokens
// ============================================================================

export function stripThinkingTokens(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

// ============================================================================
// Chat Completion
// ============================================================================

export async function performChatCompletion(
  apiKey: string,
  messages: Message[],
  model = "sonar-pro",
  stripThinking = false,
  options?: ChatOptions,
): Promise<string> {
  const useStreaming = model === "sonar-deep-research";
  const body: Record<string, unknown> = {
    model,
    messages,
    ...(useStreaming && { stream: true }),
    ...(options?.search_recency_filter && {
      search_recency_filter: options.search_recency_filter,
    }),
    ...(options?.search_domain_filter && {
      search_domain_filter: options.search_domain_filter,
    }),
    ...(options?.search_context_size && {
      web_search_options: { search_context_size: options.search_context_size },
    }),
    ...(options?.reasoning_effort && {
      reasoning_effort: options.reasoning_effort,
    }),
  };

  const response = await makeApiRequest(apiKey, "chat/completions", body);

  let data: z.infer<typeof ChatCompletionResponseSchema>;
  try {
    if (useStreaming) {
      data = await consumeSSEStream(response);
    } else {
      const json = await response.json();
      data = ChatCompletionResponseSchema.parse(json);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues;
      if (
        issues.some(
          (i) => i.path.includes("message") || i.path.includes("content"),
        )
      ) {
        throw new Error("Invalid API response: missing message content");
      }
      if (issues.some((i) => i.path.includes("choices"))) {
        throw new Error("Invalid API response: missing or empty choices array");
      }
    }
    throw new Error(
      `Failed to parse JSON response from Perplexity API: ${error}`,
    );
  }

  let messageContent = data.choices[0].message.content;

  if (stripThinking) {
    messageContent = stripThinkingTokens(messageContent);
  }

  if (data.citations && data.citations.length > 0) {
    messageContent += "\n\nCitations:\n";
    data.citations.forEach((citation, index) => {
      messageContent += `[${index + 1}] ${citation}\n`;
    });
  }

  return messageContent;
}

// ============================================================================
// Search
// ============================================================================

export async function performSearch(
  apiKey: string,
  query: string,
  maxResults = 10,
  maxTokensPerPage = 1024,
  country?: string,
): Promise<string> {
  const body: Record<string, unknown> = {
    query,
    max_results: maxResults,
    max_tokens_per_page: maxTokensPerPage,
    ...(country && { country }),
  };

  const response = await makeApiRequest(apiKey, "search", body);

  let data: z.infer<typeof SearchResponseSchema>;
  try {
    const json = await response.json();
    data = SearchResponseSchema.parse(json);
  } catch (error) {
    throw new Error(
      `Failed to parse JSON response from Perplexity Search API: ${error}`,
    );
  }

  if (!data.results || data.results.length === 0) {
    return "No search results found.";
  }

  let formatted = `Found ${data.results.length} search results:\n\n`;
  data.results.forEach((result, index) => {
    formatted += `${index + 1}. **${result.title}**\n`;
    formatted += `   URL: ${result.url}\n`;
    if (result.snippet) formatted += `   ${result.snippet}\n`;
    if (result.date) formatted += `   Date: ${result.date}\n`;
    formatted += `\n`;
  });

  return formatted;
}
