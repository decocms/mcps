import type { Env } from "../../main.ts";
import { makeApiRequest } from "@decocms/mcps-shared/tools/utils/api-client";
import type {
  ChatContextRequest,
  ChatContextResponse,
  FileListResponse,
  FileUploadResponse,
  GetFileUploadResponse,
} from "../../lib/types.ts";
import type {
  FileUploadResponse as SharedFileUploadResponse,
  FileGetResponse as SharedFileGetResponse,
  FileListResponse as SharedFileListResponse,
} from "@decocms/mcps-shared/tools/file-management";

const PINECONE_API_VERSION = "2025-10";

/**
 * Makes an authenticated request to the Pinecone Assistant API
 */
async function makeRequest<T>(
  config: { apiKey: string; host: string },
  endpoint: string,
  options: {
    method?: string;
    body?: BodyInit;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const url = `${config.host}${endpoint}`;
  const method = options.method || "GET";

  const headers: Record<string, string> = {
    "Api-Key": config.apiKey,
    "X-Pinecone-API-Version": PINECONE_API_VERSION,
    ...options.headers,
  };

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
    ...(options.body && method !== "GET" && { body: options.body }),
  };

  // DELETE returns empty response for Pinecone
  if (method === "DELETE") {
    await makeApiRequest(url, fetchOptions, "Pinecone Assistant");
    return {} as T;
  }

  return makeApiRequest(url, fetchOptions, "Pinecone Assistant");
}

/**
 * Uploads a file to the Pinecone Assistant
 */
async function uploadFile(
  env: Env,
  file: FormData,
  metadata?: Record<string, unknown>,
): Promise<SharedFileUploadResponse> {
  const state = env.DECO_REQUEST_CONTEXT.state;
  const config = {
    apiKey: state.apiKey,
    host: state.indexHost,
  };
  const assistant = state.assistant;

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
}

/**
 * Searches for relevant context in the assistant's knowledge base
 */
async function searchContext(
  env: Env,
  request: ChatContextRequest,
): Promise<ChatContextResponse> {
  const state = env.DECO_REQUEST_CONTEXT.state;
  const config = {
    apiKey: state.apiKey,
    host: state.indexHost,
  };
  const assistant = state.assistant;

  return makeRequest<ChatContextResponse>(
    config,
    `/assistant/chat/${assistant}/context`,
    {
      method: "POST",
      body: JSON.stringify(request),
    },
  );
}

/**
 * Lists all files in the assistant
 */
async function listFiles(
  env: Env,
  filter?: string,
): Promise<SharedFileListResponse> {
  const state = env.DECO_REQUEST_CONTEXT.state;
  const config = {
    apiKey: state.apiKey,
    host: state.indexHost,
  };
  const assistant = state.assistant;

  const params = filter ? `?filter=${encodeURIComponent(filter)}` : "";
  return makeRequest<FileListResponse>(
    config,
    `/assistant/files/${assistant}${params}`,
  );
}

/**
 * Gets details of a specific file
 */
async function getFile(
  env: Env,
  fileId: string,
  includeUrl?: boolean,
): Promise<SharedFileGetResponse> {
  const state = env.DECO_REQUEST_CONTEXT.state;
  const config = {
    apiKey: state.apiKey,
    host: state.indexHost,
  };
  const assistant = state.assistant;

  const params = includeUrl !== undefined ? `?include_url=${includeUrl}` : "";
  return makeRequest<GetFileUploadResponse>(
    config,
    `/assistant/files/${assistant}/${fileId}${params}`,
  );
}

/**
 * Deletes a file from the assistant
 */
async function deleteFile(env: Env, fileId: string): Promise<void> {
  const state = env.DECO_REQUEST_CONTEXT.state;
  const config = {
    apiKey: state.apiKey,
    host: state.indexHost,
  };
  const assistant = state.assistant;

  await makeRequest<void>(config, `/assistant/files/${assistant}/${fileId}`, {
    method: "DELETE",
  });
}

/**
 * Creates a Pinecone Assistant client with all available methods
 */
export const createAssistantClient = (env: Env) => ({
  uploadFile: (file: FormData, metadata?: Record<string, unknown>) =>
    uploadFile(env, file, metadata),
  searchContext: (request: ChatContextRequest) => searchContext(env, request),
  listFiles: (filter?: string) => listFiles(env, filter),
  getFile: (fileId: string, includeUrl?: boolean) =>
    getFile(env, fileId, includeUrl),
  deleteFile: (fileId: string) => deleteFile(env, fileId),
});
