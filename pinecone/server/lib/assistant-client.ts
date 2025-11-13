/**
 * Pinecone Assistant API client.
 *
 * This module provides a simple HTTP client for interacting with the
 * Pinecone Assistant API. It handles authentication and request formatting.
 */

import type { Env } from "../main.ts";
import type {
  ChatContextRequest,
  ChatContextResponse,
  FileListResponse,
  FileUploadResponse,
  GetFileUploadResponse,
} from "./types.ts";

const PINECONE_API_VERSION = "2025-10";

interface RequestOptions {
  method?: string;
  body?: BodyInit;
  headers?: Record<string, string>;
}

/**
 * Makes an authenticated request to the Pinecone Assistant API
 */
async function makeRequest<T>(
  config: { apiKey: string; host: string },
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const url = `${config.host}${endpoint}`;

  const headers = {
    "Api-Key": config.apiKey,
    "X-Pinecone-API-Version": PINECONE_API_VERSION,
    ...options.headers,
  };

  // Don't set Content-Type for FormData - browser/runtime will set it with boundary
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const method = options.method || "GET";
  const fetchOptions: RequestInit = {
    method,
    headers,
  };

  // Only include body for non-GET requests
  if (options.body && method !== "GET") {
    fetchOptions.body = options.body;
  }

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Pinecone Assistant API error (${response.status}): ${errorText}`,
    );
  }

  // DELETE returns empty response
  if (response.status === 200 && method === "DELETE") {
    return {} as T;
  }

  return response.json();
}

/**
 * Creates a Pinecone Assistant client from the environment
 */
export function createAssistantClient(env: Env) {
  const state = env.DECO_REQUEST_CONTEXT.state;
  const config = {
    apiKey: state.apiKey,
    host: state.indexHost,
  };
  const assistant = state.assistant;

  return {
    /**
     * Upload a file to the assistant
     */
    uploadFile: async (
      file: FormData,
      metadata?: Record<string, unknown>,
    ): Promise<FileUploadResponse> => {
      const params = metadata
        ? `?metadata=${encodeURIComponent(JSON.stringify(metadata))}`
        : "";

      return makeRequest<FileUploadResponse>(
        config,
        `/assistant/files/${assistant}${params}`,
        {
          method: "POST",
          body: file,
        },
      );
    },

    /**
     * Search for relevant context snippets
     */
    searchContext: async (
      request: ChatContextRequest,
    ): Promise<ChatContextResponse> => {
      return makeRequest<ChatContextResponse>(
        config,
        `/assistant/chat/${assistant}/context`,
        {
          method: "POST",
          body: JSON.stringify(request),
        },
      );
    },

    /**
     * List all files in the assistant
     */
    listFiles: async (filter?: string): Promise<FileListResponse> => {
      const params = filter ? `?filter=${encodeURIComponent(filter)}` : "";
      return makeRequest<FileListResponse>(
        config,
        `/assistant/files/${assistant}${params}`,
      );
    },

    /**
     * Get a specific file by ID
     */
    getFile: async (
      fileId: string,
      includeUrl?: boolean,
    ): Promise<GetFileUploadResponse> => {
      const params =
        includeUrl !== undefined ? `?include_url=${includeUrl}` : "";
      return makeRequest<GetFileUploadResponse>(
        config,
        `/assistant/files/${assistant}/${fileId}${params}`,
      );
    },

    /**
     * Delete a file by ID
     */
    deleteFile: async (fileId: string): Promise<void> => {
      await makeRequest<void>(
        config,
        `/assistant/files/${assistant}/${fileId}`,
        {
          method: "DELETE",
        },
      );
    },
  };
}
