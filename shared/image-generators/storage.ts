/**
 * Storage utilities for saving generated images.
 *
 * Provides helpers for storing images in file systems, S3-compatible storage,
 * and other backends.
 */

/**
 * File system read/write response.
 */
export interface FileSystemUrlResponse {
  url: string;
}

/**
 * Environment that supports file system operations.
 */
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

/**
 * Options for saving an image.
 */
export interface SaveImageOptions {
  /** Base64-encoded image data or data URL */
  imageData: string;
  /** MIME type of the image (e.g., "image/png", "image/jpeg") */
  mimeType: string;
  /** Optional metadata to store with the image */
  metadata?: Record<string, string>;
  /** Directory path for the image */
  directory?: string;
  /** Read URL expiration time in seconds (default: 3600 = 1 hour) */
  readExpiresIn?: number;
  /** Write URL expiration time in seconds (default: 60) */
  writeExpiresIn?: number;
}

/**
 * Result of saving an image.
 */
export interface SaveImageResult {
  /** Public URL to access the image */
  url: string;
  /** Path where the image was saved */
  path: string;
}

/**
 * Saves a base64-encoded image to the file system.
 *
 * @param env - Environment with FILE_SYSTEM binding
 * @param options - Save options
 * @returns The URL and path of the saved image
 *
 * @example
 * ```typescript
 * const result = await saveImageToFileSystem(env, {
 *   imageData: "data:image/png;base64,...",
 *   mimeType: "image/png",
 *   metadata: { prompt: "a beautiful sunset" },
 * });
 * console.log(result.url); // https://...
 * ```
 */
export async function saveImageToFileSystem<TEnv extends FileSystemEnv>(
  env: TEnv,
  options: SaveImageOptions,
): Promise<SaveImageResult> {
  if (!env.FILE_SYSTEM) {
    throw new Error("FILE_SYSTEM binding not configured");
  }

  const {
    imageData,
    mimeType,
    metadata = {},
    directory = "/images",
    readExpiresIn = 3600,
    writeExpiresIn = 60,
  } = options;

  // Extract file extension from MIME type
  const extension = mimeType.split("/")[1] || "png";

  // Generate unique path with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${directory}/${timestamp}.${extension}`;

  // Get read and write URLs
  const [{ url: readUrl }, { url: writeUrl }] = await Promise.all([
    env.FILE_SYSTEM.FS_READ({
      path,
      expiresIn: readExpiresIn,
    }),
    env.FILE_SYSTEM.FS_WRITE({
      path,
      metadata,
      contentType: mimeType,
      expiresIn: writeExpiresIn,
    }),
  ]);

  // Convert base64 to buffer
  // Handle both plain base64 and data URLs
  const base64Data = imageData.includes(",")
    ? imageData.split(",")[1]
    : imageData;
  const imageBuffer = Buffer.from(base64Data, "base64");

  // Upload image
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

/**
 * Extracts MIME type and data from an inline data object.
 *
 * @param inlineData - Inline data object with mime_type and data
 * @returns Object with mimeType and imageData
 */
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
