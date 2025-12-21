import { z } from "zod";
import { WhatsAppAPIClient } from "../lib/client";
import type { Env } from "../main";
import { createTool } from "@decocms/runtime/tools";

const SUPPORTED_FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "video/mp4",
] as const;
type SupportedFileType = (typeof SUPPORTED_FILE_TYPES)[number];

const uploadFile = (env: Env) =>
  createTool({
    id: "UPLOAD_FILE",
    description:
      "Uploads a file to Meta's graph using the Resumable Upload API. Returns a file handle that can be used in other API calls (e.g., profile_picture_handle for updating phone number profile). Supported file types: pdf, jpeg, jpg, png, mp4.",
    inputSchema: z.object({
      appId: z.string().describe("The Meta App ID"),
      fileUrl: z.string().describe("URL of the file to upload"),
      fileName: z
        .string()
        .optional()
        .describe(
          "Optional file name. If not provided, will try to extract from Content-Disposition header or URL",
        ),
    }),
    outputSchema: z.object({
      handle: z.string().describe("The file handle to use in other API calls"),
      uploadSessionId: z.string().describe("The upload session ID"),
    }),
    execute: async ({ context }) => {
      const state = env.MESH_REQUEST_CONTEXT.state;
      const client = new WhatsAppAPIClient({
        accessToken: state.whatsAppAccessToken,
        businessAccountId: state.whatsAppBusinessAccountId,
      });

      // Step 1: Fetch the file to get metadata and content
      const fileResponse = await fetch(context.fileUrl);
      if (!fileResponse.ok) {
        throw new Error(`Failed to fetch file: ${fileResponse.statusText}`);
      }

      const fileData = await fileResponse.arrayBuffer();
      const fileLength = fileData.byteLength;

      const contentType = fileResponse.headers.get("content-type");
      if (
        !contentType ||
        !SUPPORTED_FILE_TYPES.includes(contentType as SupportedFileType)
      ) {
        throw new Error(
          `Unsupported file type: ${contentType}. Supported types: ${SUPPORTED_FILE_TYPES.join(", ")}`,
        );
      }
      const fileType = contentType as SupportedFileType;

      // Try to get filename from: provided param > Content-Disposition header > URL
      let fileName = context.fileName;
      if (!fileName) {
        const disposition = fileResponse.headers.get("content-disposition");
        if (disposition) {
          const match = disposition.match(
            /filename[^;=\n]*=(['"]?)([^'"\n]*)\1/,
          );
          if (match) {
            fileName = match[2];
          }
        }
      }
      if (!fileName) {
        // Extract from URL path
        const urlPath = new URL(context.fileUrl).pathname;
        fileName = urlPath.split("/").pop() || "file";
      }

      // Step 2: Start upload session
      const { id: uploadSessionId } = await client.startUploadSession({
        appId: context.appId,
        fileName,
        fileLength,
        fileType,
      });

      // Step 3: Upload the file binary
      const { h: handle } = await client.uploadFileToSession({
        uploadSessionId,
        fileData,
        fileOffset: 0,
      });

      return { handle, uploadSessionId };
    },
  });

const getUploadStatus = (env: Env) =>
  createTool({
    id: "GET_UPLOAD_STATUS",
    description:
      "Gets the status of an upload session. Useful for resuming interrupted uploads. Returns the file_offset to resume from.",
    inputSchema: z.object({
      uploadSessionId: z
        .string()
        .describe("The upload session ID (format: upload:<SESSION_ID>)"),
    }),
    outputSchema: z.object({
      id: z.string(),
      file_offset: z.number(),
    }),
    execute: async ({ context }) => {
      const state = env.MESH_REQUEST_CONTEXT.state;
      const client = new WhatsAppAPIClient({
        accessToken: state.whatsAppAccessToken,
        businessAccountId: state.whatsAppBusinessAccountId,
      });

      return client.getUploadStatus({
        uploadSessionId: context.uploadSessionId,
      });
    },
  });

const resumeUpload = (env: Env) =>
  createTool({
    id: "RESUME_UPLOAD",
    description:
      "Resumes an interrupted file upload from where it left off. Use GET_UPLOAD_STATUS first to get the file_offset.",
    inputSchema: z.object({
      uploadSessionId: z
        .string()
        .describe("The upload session ID (format: upload:<SESSION_ID>)"),
      fileUrl: z
        .string()
        .describe(
          "URL of the file to upload (same file as the original upload)",
        ),
      fileOffset: z
        .number()
        .describe(
          "The byte offset to resume from (obtained from GET_UPLOAD_STATUS)",
        ),
    }),
    outputSchema: z.object({
      handle: z.string().describe("The file handle to use in other API calls"),
    }),
    execute: async ({ context }) => {
      const state = env.MESH_REQUEST_CONTEXT.state;
      const client = new WhatsAppAPIClient({
        accessToken: state.whatsAppAccessToken,
        businessAccountId: state.whatsAppBusinessAccountId,
      });

      // Fetch the file
      const fileResponse = await fetch(context.fileUrl);
      if (!fileResponse.ok) {
        throw new Error(`Failed to fetch file: ${fileResponse.statusText}`);
      }

      const fullFileData = await fileResponse.arrayBuffer();

      // Slice the file from the offset
      const remainingData = fullFileData.slice(context.fileOffset);

      // Resume upload from offset
      const { h: handle } = await client.uploadFileToSession({
        uploadSessionId: context.uploadSessionId,
        fileData: remainingData,
        fileOffset: context.fileOffset,
      });

      return { handle };
    },
  });

export const filesTools = [uploadFile, getUploadStatus, resumeUpload];
