/**
 * File Management Tools Utilities
 *
 * This module provides reusable utilities for creating file management tools
 * in MCPs. It standardizes common patterns like:
 * - Converting file URLs or content to File objects
 * - Creating FormData for file uploads
 * - Standard input/output schemas
 * - Error handling patterns
 *
 * Usage example:
 * ```ts
 * import { createFileFromInput, fileUploadInputSchema } from '@decocms/mcps-shared/tools/file-management';
 *
 * export const createUploadFileTool = (env: Env) =>
 *   createPrivateTool({
 *     id: "upload_file",
 *     description: "Uploads a file",
 *     inputSchema: fileUploadInputSchema,
 *     execute: async ({ input }) => {
 *       const file = await createFileFromInput(input);
 *       // ... use file
 *     },
 *   });
 * ```
 */

import { z } from "zod";

/**
 * Standard input schema for file upload operations.
 * Supports both file URL and direct file content.
 */
export const fileUploadInputSchema = z.object({
  fileUrl: z.string().optional().describe("The URL of the file to upload"),
  fileContent: z
    .string()
    .optional()
    .describe("The content of the file to upload (text only)"),
  fileName: z
    .string()
    .optional()
    .describe(
      "The optional name of the file with extension (if not provided, the file will be named 'file-{timestamp}.txt')",
    ),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("The optional metadata to attach to the file"),
});

export type FileUploadInput = z.infer<typeof fileUploadInputSchema>;

/**
 * Standard schema for file information in responses
 */
export const fileInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string().optional(),
  created_on: z.string().optional(),
  updated_on: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type FileInfo = z.infer<typeof fileInfoSchema>;

/**
 * Standard output schema for file upload operations
 */
export const fileUploadOutputSchema = z.object({
  success: z.boolean(),
  file: fileInfoSchema.nullable(),
  message: z.string().optional(),
});

export type FileUploadOutput = z.infer<typeof fileUploadOutputSchema>;

/**
 * Standard input schema for file deletion operations
 */
export const fileDeleteInputSchema = z.object({
  fileId: z.string().describe("The ID of the file to delete"),
});

export type FileDeleteInput = z.infer<typeof fileDeleteInputSchema>;

/**
 * Standard output schema for file deletion operations
 */
export const fileDeleteOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

export type FileDeleteOutput = z.infer<typeof fileDeleteOutputSchema>;

/**
 * Standard input schema for getting a specific file
 */
export const fileGetInputSchema = z.object({
  fileId: z.string().describe("The ID of the file to retrieve"),
  includeUrl: z
    .boolean()
    .optional()
    .describe("Whether to include a signed URL for downloading the file"),
});

export type FileGetInput = z.infer<typeof fileGetInputSchema>;

/**
 * Extended file info schema for get operations (may include download URL)
 */
export const fileGetOutputSchema = z.object({
  success: z.boolean(),
  file: fileInfoSchema
    .extend({
      signed_url: z.string().nullable().optional(),
      percent_done: z.number().nullable().optional(),
      error_message: z.string().nullable().optional(),
    })
    .nullable(),
  message: z.string().optional(),
});

export type FileGetOutput = z.infer<typeof fileGetOutputSchema>;

/**
 * Standard input schema for listing files
 */
export const fileListInputSchema = z.object({
  filter: z.string().optional().describe("Optional filter for files"),
  limit: z.number().optional().describe("Maximum number of files to return"),
  offset: z.number().optional().describe("Number of files to skip"),
});

export type FileListInput = z.infer<typeof fileListInputSchema>;

/**
 * Standard output schema for listing files
 */
export const fileListOutputSchema = z.object({
  success: z.boolean(),
  files: z.array(fileInfoSchema),
  total: z.number().optional(),
  message: z.string().optional(),
});

export type FileListOutput = z.infer<typeof fileListOutputSchema>;

/**
 * Result of creating a file from input
 */
export interface CreateFileResult {
  file: File;
  contentType: string;
}

/**
 * Error response for file operations
 */
export interface FileOperationError {
  success: false;
  message: string;
  file: null;
}

/**
 * Creates a File object from either a file URL or file content.
 *
 * This is a common pattern in file upload operations where you need to support
 * both direct file content and fetching files from URLs.
 *
 * @param input - The file upload input containing either fileUrl or fileContent
 * @returns A File object ready to be uploaded
 * @throws Error if neither fileUrl nor fileContent is provided
 *
 * @example
 * ```ts
 * const file = await createFileFromInput({
 *   fileUrl: "https://example.com/file.pdf",
 *   fileName: "document.pdf"
 * });
 * ```
 */
export async function createFileFromInput(
  input: FileUploadInput,
): Promise<CreateFileResult> {
  if (!input.fileUrl && !input.fileContent) {
    throw new Error("No file URL or content provided");
  }

  let fileBuffer: ArrayBuffer | null = null;
  let contentType: string | null = null;

  // Fetch file from URL if provided
  if (input.fileUrl) {
    const fileResponse = await fetch(input.fileUrl);
    if (!fileResponse.ok) {
      throw new Error(
        `Failed to fetch file from URL: ${fileResponse.status} ${fileResponse.statusText}`,
      );
    }
    contentType = fileResponse.headers.get("content-type");
    fileBuffer = await fileResponse.arrayBuffer();
  }

  // Use file content if provided
  if (input.fileContent) {
    fileBuffer = new TextEncoder().encode(input.fileContent)
      .buffer as ArrayBuffer;
    contentType = "text/plain";
  }

  if (!fileBuffer) {
    throw new Error(
      "Could not create a file buffer from the provided file URL or content",
    );
  }

  const fileName = input.fileName || `file-${Date.now()}.txt`;
  const file = new File([fileBuffer], fileName, {
    type: contentType || "application/octet-stream",
  });

  return {
    file,
    contentType: contentType || "application/octet-stream",
  };
}

/**
 * Creates a FormData object with a file, ready for multipart/form-data upload.
 *
 * @param file - The File object to include in the FormData
 * @param fieldName - The field name for the file (default: "file")
 * @param additionalFields - Optional additional fields to include in the FormData
 * @returns A FormData object ready to be sent in a POST request
 *
 * @example
 * ```ts
 * const file = await createFileFromInput(input);
 * const formData = createFormDataWithFile(file, "file", {
 *   userId: "123",
 *   category: "documents"
 * });
 * ```
 */
export function createFormDataWithFile(
  file: File,
  fieldName = "file",
  additionalFields?: Record<string, string>,
): FormData {
  const formData = new FormData();
  formData.append(fieldName, file);

  if (additionalFields) {
    for (const [key, value] of Object.entries(additionalFields)) {
      formData.append(key, value);
    }
  }

  return formData;
}

/**
 * Creates a standard error response for file operations.
 *
 * @param message - The error message
 * @param error - Optional error object for additional context
 * @returns A standardized error response object
 *
 * @example
 * ```ts
 * try {
 *   // ... file operation
 * } catch (error) {
 *   return createFileOperationError("Failed to upload file", error);
 * }
 * ```
 */
export function createFileOperationError(
  message: string,
  error?: unknown,
): FileOperationError {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return {
    success: false,
    message: error ? `${message}: ${errorMessage}` : message,
    file: null,
  };
}

/**
 * Wraps a file operation with standard error handling.
 *
 * This helper reduces boilerplate by providing consistent error handling
 * for file operations.
 *
 * @param operation - The async operation to execute
 * @param errorMessage - The error message prefix to use if operation fails
 * @returns The result of the operation or a standard error response
 *
 * @example
 * ```ts
 * return await withFileOperationErrorHandling(
 *   async () => {
 *     const file = await createFileFromInput(input);
 *     return await uploadToService(file);
 *   },
 *   "Failed to upload file"
 * );
 * ```
 */
export async function withFileOperationErrorHandling<T>(
  operation: () => Promise<T>,
  errorMessage: string,
): Promise<T | FileOperationError> {
  try {
    return await operation();
  } catch (error) {
    return createFileOperationError(errorMessage, error);
  }
}

/**
 * Validates that a file ID is provided and non-empty.
 *
 * @param fileId - The file ID to validate
 * @throws Error if fileId is not provided or is empty
 */
export function validateFileId(fileId: string): void {
  if (!fileId || fileId.trim() === "") {
    throw new Error("File ID is required");
  }
}

/**
 * Creates a success response for file upload operations.
 *
 * @param file - The file information
 * @param message - Optional success message
 * @returns A standardized success response
 */
export function createFileUploadSuccess(
  file: FileInfo,
  message?: string,
): FileUploadOutput {
  return {
    success: true,
    file,
    message: message || "File uploaded successfully",
  };
}

/**
 * Creates a success response for file deletion operations.
 *
 * @param message - Optional success message
 * @returns A standardized success response
 */
export function createFileDeleteSuccess(message?: string): FileDeleteOutput {
  return {
    success: true,
    message: message || "File deleted successfully",
  };
}

/**
 * Creates a success response for file list operations.
 *
 * @param files - Array of file information
 * @param total - Optional total count of files
 * @param message - Optional success message
 * @returns A standardized success response
 */
export function createFileListSuccess(
  files: FileInfo[],
  total?: number,
  message?: string,
): FileListOutput {
  return {
    success: true,
    files,
    total,
    message,
  };
}

/**
 * Parses a filter string (usually JSON) into an object.
 *
 * @param filter - The filter string to parse
 * @returns The parsed filter object or undefined if no filter provided
 * @throws Error if filter is invalid JSON
 *
 * @example
 * ```ts
 * const filter = parseFilterString('{"type": "pdf", "size": {"$gt": 1000}}');
 * // Returns: { type: "pdf", size: { $gt: 1000 } }
 * ```
 */
export function parseFilterString(
  filter?: string,
): Record<string, unknown> | undefined {
  if (!filter) {
    return undefined;
  }

  try {
    return JSON.parse(filter);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    throw new Error(
      `Invalid filter format. Expected valid JSON, got: ${filter}. Error: ${errorMessage}`,
    );
  }
}

/**
 * Builds query parameters for file list operations.
 *
 * @param params - Object containing optional filter, limit, and offset
 * @returns URL query string (including leading '?' if params exist)
 *
 * @example
 * ```ts
 * const query = buildFileListQueryParams({
 *   filter: '{"type": "pdf"}',
 *   limit: 10,
 *   offset: 20
 * });
 * // Returns: "?filter=%7B%22type%22%3A%22pdf%22%7D&limit=10&offset=20"
 * ```
 */
export function buildFileListQueryParams(params: {
  filter?: string;
  limit?: number;
  offset?: number;
}): string {
  const searchParams = new URLSearchParams();

  if (params.filter) {
    searchParams.append("filter", params.filter);
  }
  if (params.limit !== undefined) {
    searchParams.append("limit", String(params.limit));
  }
  if (params.offset !== undefined) {
    searchParams.append("offset", String(params.offset));
  }

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
}
