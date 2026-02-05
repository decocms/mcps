/**
 * File Management Tools Factory
 *
 * This module provides a factory for creating file management tools
 * following the same pattern as video-generators and image-generators.
 * It standardizes the creation of file upload, list, get, delete, and search tools.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import {
  fileUploadInputSchema,
  fileUploadOutputSchema,
  fileDeleteInputSchema,
  fileDeleteOutputSchema,
  fileGetInputSchema,
  fileGetOutputSchema,
  fileListInputSchema,
  fileListOutputSchema,
  createFileUploadSuccess,
  createFileDeleteSuccess,
  createFileListSuccess,
  validateFileId,
  withFileOperationErrorHandling,
  type FileUploadInput,
  type FileGetInput,
  type FileDeleteInput,
  type FileListInput,
  type FileInfo,
} from "../file-management.ts";

export interface FileManagementEnv {
  DECO_REQUEST_CONTEXT: {
    ensureAuthenticated: () => any;
  };
  DECO_CHAT_WORKSPACE: string;
}

/**
 * File upload response from the provider
 */
export interface FileUploadResponse {
  id: string;
  name: string;
  status?: string;
  created_on?: string;
  updated_on?: string;
  metadata?: Record<string, unknown> | null;
  error_message?: string | null;
}

/**
 * File get response from the provider (includes optional signed URL)
 */
export interface FileGetResponse extends FileUploadResponse {
  signed_url?: string | null;
  percent_done?: number | null;
  error_message?: string | null;
}

/**
 * File list response from the provider
 */
export interface FileListResponse {
  files: FileInfo[];
  total?: number;
}

/**
 * Search/context response item
 */
export interface SearchResultItem {
  type: string;
  text: string;
  metadata?: Record<string, string>;
}

/**
 * Search/context output
 */
export interface SearchOutput {
  content: SearchResultItem[];
}

/**
 * Generic file management client interface
 */
export interface FileManagementClient {
  uploadFile: (
    formData: FormData,
    metadata?: Record<string, unknown>,
  ) => Promise<FileUploadResponse>;
  listFiles: (filter?: string) => Promise<FileListResponse>;
  getFile: (fileId: string, includeUrl?: boolean) => Promise<FileGetResponse>;
  deleteFile: (fileId: string) => Promise<void>;
  searchContext?: (request: any) => Promise<any>;
}

/**
 * Configuration for upload file tool
 */
export interface UploadToolConfig<
  TEnv extends FileManagementEnv,
  TClient extends FileManagementClient,
> {
  execute: ({
    env,
    input,
    client,
  }: {
    env: TEnv;
    input: FileUploadInput;
    client: TClient;
  }) => Promise<FileUploadResponse>;
  successMessage?: string;
  getContract?: (env: TEnv) => {
    binding: any;
    clause: { clauseId: string; amount: number };
  };
}

/**
 * Configuration for list files tool
 */
export interface ListToolConfig<
  TEnv extends FileManagementEnv,
  TClient extends FileManagementClient,
> {
  execute: ({
    env,
    input,
    client,
  }: {
    env: TEnv;
    input: FileListInput;
    client: TClient;
  }) => Promise<FileListResponse>;
}

/**
 * Configuration for get file tool
 */
export interface GetToolConfig<
  TEnv extends FileManagementEnv,
  TClient extends FileManagementClient,
> {
  execute: ({
    env,
    input,
    client,
  }: {
    env: TEnv;
    input: FileGetInput;
    client: TClient;
  }) => Promise<FileGetResponse>;
  getContract?: (env: TEnv) => {
    binding: any;
    clause: { clauseId: string; amount: number };
  };
}

/**
 * Configuration for delete file tool
 */
export interface DeleteToolConfig<
  TEnv extends FileManagementEnv,
  TClient extends FileManagementClient,
> {
  execute: ({
    env,
    input,
    client,
  }: {
    env: TEnv;
    input: FileDeleteInput;
    client: TClient;
  }) => Promise<void>;
  successMessage?: string;
  getContract?: (env: TEnv) => {
    binding: any;
    clause: { clauseId: string; amount: number };
  };
}

/**
 * Configuration for search/context tool
 */
export interface SearchToolConfig<
  TEnv extends FileManagementEnv,
  TClient extends FileManagementClient,
> {
  inputSchema: any;
  outputSchema: any;
  execute: ({
    env,
    input,
    client,
  }: {
    env: TEnv;
    input: any;
    client: TClient;
  }) => Promise<SearchOutput>;
  description?: string;
  getContract?: (env: TEnv) => {
    binding: any;
    clause: { clauseId: string; amount: number };
  };
}

/**
 * Main configuration for file management tools factory
 */
export interface CreateFileManagementOptions<
  TEnv extends FileManagementEnv,
  TClient extends FileManagementClient,
> {
  metadata: {
    provider: string;
    description?: string;
  };
  getClient: (env: TEnv) => TClient;
  uploadTool: UploadToolConfig<TEnv, TClient>;
  listTool: ListToolConfig<TEnv, TClient>;
  getTool: GetToolConfig<TEnv, TClient>;
  deleteTool: DeleteToolConfig<TEnv, TClient>;
  searchTool?: SearchToolConfig<TEnv, TClient>;
}

export function createFileManagementTools<
  TEnv extends FileManagementEnv,
  TClient extends FileManagementClient,
>(options: CreateFileManagementOptions<TEnv, TClient>) {
  const uploadFile = (env: TEnv) =>
    createPrivateTool({
      id: "upload_file",
      description:
        options.metadata.description ||
        `Uploads a file to ${options.metadata.provider}. You can provide either a file URL or file content. The file will be processed and made available for context retrieval.`,
      inputSchema: fileUploadInputSchema,
      outputSchema: fileUploadOutputSchema,
      execute: async ({ context }: { context: FileUploadInput }) => {
        return await withFileOperationErrorHandling(async () => {
          const contractConfig = options.uploadTool.getContract?.(env);
          let transactionId: string | undefined;

          // Only authorize contract if getContract is provided
          if (contractConfig) {
            const authResponse =
              await contractConfig.binding.CONTRACT_AUTHORIZE({
                clauses: [
                  {
                    clauseId: contractConfig.clause.clauseId,
                    amount: contractConfig.clause.amount,
                  },
                ],
              });
            transactionId = authResponse.transactionId;
          }

          const client = options.getClient(env);

          // Execute provider-specific upload logic (handles file preparation internally)
          const data = await options.uploadTool.execute({
            env,
            input: context,
            client,
          });

          // Check for API errors
          if (data.error_message) {
            throw new Error(data.error_message);
          }

          // Only settle contract if we authorized one
          if (contractConfig && transactionId) {
            await contractConfig.binding.CONTRACT_SETTLE({
              transactionId,
              clauses: [
                {
                  clauseId: contractConfig.clause.clauseId,
                  amount: contractConfig.clause.amount,
                },
              ],
              vendorId: env.DECO_CHAT_WORKSPACE,
            });
          }

          // Return standardized success response
          return createFileUploadSuccess(
            {
              id: data.id,
              name: data.name,
              status: data.status,
              created_on: data.created_on,
              updated_on: data.updated_on,
              metadata: data.metadata,
            },
            options.uploadTool.successMessage ||
              "File uploaded successfully. It may take a few minutes to be available.",
          );
        }, "Failed to upload file");
      },
    });

  const listFiles = (env: TEnv) =>
    createPrivateTool({
      id: "list_files",
      description: `Lists all files in ${options.metadata.provider}`,
      inputSchema: fileListInputSchema,
      outputSchema: fileListOutputSchema,
      execute: async ({ context }: { context: FileListInput }) => {
        try {
          const client = options.getClient(env);
          const result = await options.listTool.execute({
            env,
            input: context,
            client,
          });

          // Return standardized success response
          return createFileListSuccess(result.files, result.total);
        } catch (error) {
          return {
            success: false,
            files: [],
            message:
              error instanceof Error ? error.message : "Failed to list files",
          };
        }
      },
    });

  const getFile = (env: TEnv) =>
    createPrivateTool({
      id: "get_file",
      description: `Gets details of a specific file from ${options.metadata.provider}`,
      inputSchema: fileGetInputSchema,
      outputSchema: fileGetOutputSchema,
      execute: async ({ context }: { context: FileGetInput }) => {
        return await withFileOperationErrorHandling(async () => {
          const contractConfig = options.getTool.getContract?.(env);
          let transactionId: string | undefined;

          // Only authorize contract if getContract is provided
          if (contractConfig) {
            const authResponse =
              await contractConfig.binding.CONTRACT_AUTHORIZE({
                clauses: [
                  {
                    clauseId: contractConfig.clause.clauseId,
                    amount: contractConfig.clause.amount,
                  },
                ],
              });
            transactionId = authResponse.transactionId;
          }

          // Validate input using shared utility
          validateFileId(context.fileId);

          const client = options.getClient(env);
          const file = await options.getTool.execute({
            env,
            input: context,
            client,
          });

          // Only settle contract if we authorized one
          if (contractConfig && transactionId) {
            await contractConfig.binding.CONTRACT_SETTLE({
              transactionId,
              clauses: [
                {
                  clauseId: contractConfig.clause.clauseId,
                  amount: contractConfig.clause.amount,
                },
              ],
              vendorId: env.DECO_CHAT_WORKSPACE,
            });
          }

          // Return standardized success response
          return {
            success: true,
            file: {
              id: file.id,
              name: file.name,
              status: file.status,
              created_on: file.created_on,
              updated_on: file.updated_on,
              metadata: file.metadata,
              signed_url: file.signed_url,
              percent_done: file.percent_done,
              error_message: file.error_message,
            },
          };
        }, "Failed to get file");
      },
    });

  const deleteFile = (env: TEnv) =>
    createPrivateTool({
      id: "delete_file",
      description: `Deletes a file from ${options.metadata.provider}`,
      inputSchema: fileDeleteInputSchema,
      outputSchema: fileDeleteOutputSchema,
      execute: async ({ context }: { context: FileDeleteInput }) => {
        return await withFileOperationErrorHandling(async () => {
          const contractConfig = options.deleteTool.getContract?.(env);
          let transactionId: string | undefined;

          // Only authorize contract if getContract is provided
          if (contractConfig) {
            const authResponse =
              await contractConfig.binding.CONTRACT_AUTHORIZE({
                clauses: [
                  {
                    clauseId: contractConfig.clause.clauseId,
                    amount: contractConfig.clause.amount,
                  },
                ],
              });
            transactionId = authResponse.transactionId;
          }

          // Validate input using shared utility
          validateFileId(context.fileId);

          const client = options.getClient(env);
          await options.deleteTool.execute({ env, input: context, client });

          // Only settle contract if we authorized one
          if (contractConfig && transactionId) {
            await contractConfig.binding.CONTRACT_SETTLE({
              transactionId,
              clauses: [
                {
                  clauseId: contractConfig.clause.clauseId,
                  amount: contractConfig.clause.amount,
                },
              ],
              vendorId: env.DECO_CHAT_WORKSPACE,
            });
          }

          // Return standardized success response
          return createFileDeleteSuccess(
            options.deleteTool.successMessage || "File deleted successfully",
          );
        }, "Failed to delete file");
      },
    });

  const searchContext = options.searchTool
    ? (env: TEnv) => {
        const searchToolConfig = options.searchTool!;
        return createPrivateTool({
          id: "search_context",
          description:
            searchToolConfig.description ||
            `Retrieves relevant document snippets from ${options.metadata.provider}'s knowledge base.`,
          inputSchema: searchToolConfig.inputSchema,
          outputSchema: searchToolConfig.outputSchema,
          execute: async ({ context }: { context: any }) => {
            const contractConfig = searchToolConfig.getContract?.(env);
            let transactionId: string | undefined;

            // Only authorize contract if getContract is provided
            if (contractConfig) {
              const authResponse =
                await contractConfig.binding.CONTRACT_AUTHORIZE({
                  clauses: [
                    {
                      clauseId: contractConfig.clause.clauseId,
                      amount: contractConfig.clause.amount,
                    },
                  ],
                });
              transactionId = authResponse.transactionId;
            }

            const client = options.getClient(env);
            const result = await searchToolConfig.execute({
              env,
              input: context,
              client,
            });

            // Only settle contract if we authorized one
            if (contractConfig && transactionId) {
              await contractConfig.binding.CONTRACT_SETTLE({
                transactionId,
                clauses: [
                  {
                    clauseId: contractConfig.clause.clauseId,
                    amount: contractConfig.clause.amount,
                  },
                ],
                vendorId: env.DECO_CHAT_WORKSPACE,
              });
            }

            return result;
          },
        });
      }
    : null;

  // Build tools object with available tools as properties
  return {
    uploadFile,
    listFiles,
    getFile,
    deleteFile,
    ...(searchContext && { searchContext }),
  };
}
