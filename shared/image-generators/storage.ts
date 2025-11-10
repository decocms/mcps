// Re-export storage primitives from shared/storage
export {
  type ObjectStorage,
  type ExtendedObjectStorage,
  S3StorageAdapter,
  FileSystemStorageAdapter,
  createStorageFromState,
  createS3Storage,
  createFileSystemStorage,
  createStorageFromEnv,
} from "@decocms/mcps-shared/storage";

import type { ObjectStorage } from "@decocms/mcps-shared/storage";

/** @deprecated Use FileSystemBinding from @decocms/mcps-shared/storage instead */
export interface FileSystemUrlResponse {
  url: string;
}
export interface FileSystemEnv {
  FILE_SYSTEM?: {
    FS_READ: (input: {
      path: string;
      expiresIn: number;
    }) => Promise<FileSystemUrlResponse>;
    FS_WRITE: (input: {
      path: string;
      metadata?: Record<string, string>;
      contentType?: string;
      expiresIn: number;
    }) => Promise<FileSystemUrlResponse>;
  };
}

export interface SaveImageOptions {
  imageData: string;
  mimeType: string;
  metadata?: Record<string, string>;
  directory?: string;
  readExpiresIn?: number;
  writeExpiresIn?: number;
  fileName?: string;
}

export interface SaveImageResult {
  url: string;
  path: string;
}
export async function saveImage(
  storage: ObjectStorage,
  options: SaveImageOptions,
): Promise<SaveImageResult> {
  const {
    imageData,
    mimeType,
    metadata = {},
    directory = "/images",
    readExpiresIn = 3600,
    writeExpiresIn = 60,
    fileName,
  } = options;

  const extension = mimeType.split("/")[1] || "png";
  const name = fileName || new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${directory}/${name}.${extension}`;

  const [readUrl, writeUrl] = await Promise.all([
    storage.getReadUrl(path, readExpiresIn),
    storage.getWriteUrl(path, {
      contentType: mimeType,
      metadata,
      expiresIn: writeExpiresIn,
    }),
  ]);

  const base64Data = imageData.includes(",")
    ? imageData.split(",")[1]
    : imageData;
  const imageBuffer = Buffer.from(base64Data, "base64");

  const uploadResponse = await fetch(writeUrl, {
    method: "PUT",
    headers: {
      "Content-Type": mimeType,
    },
    body: imageBuffer,
  });

  if (!uploadResponse.ok) {
    throw new Error(
      `Failed to upload image: ${uploadResponse.status} ${uploadResponse.statusText}`,
    );
  }

  return {
    url: readUrl,
    path,
  };
}

export function extractImageData(inlineData: {
  mime_type?: string;
  data: string;
}): {
  mimeType: string;
  imageData: string;
} {
  return {
    mimeType: inlineData.mime_type || "image/png",
    imageData: inlineData.data,
  };
}
