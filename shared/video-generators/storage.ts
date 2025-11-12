import type { ObjectStorage } from "@decocms/mcps-shared/storage";

export interface SaveVideoOptions {
  videoData: Blob | ArrayBuffer | ReadableStream;
  mimeType: string;
  metadata?: Record<string, string>;
  directory?: string;
  readExpiresIn?: number;
  writeExpiresIn?: number;
  fileName?: string;
}

export interface SaveVideoResult {
  url: string;
  key: string;
}

export async function saveVideo(
  storage: ObjectStorage,
  options: SaveVideoOptions,
): Promise<SaveVideoResult> {
  const {
    videoData,
    mimeType,
    metadata = {},
    directory = "/videos",
    readExpiresIn = 3600,
    writeExpiresIn = 300, // 5 minutes for larger files
    fileName,
  } = options;

  const extension = mimeType.split("/")[1] || "mp4";
  const name = fileName || new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${directory}/${name}.${extension}`;

  const [readUrl, writeUrl] = await Promise.all([
    storage.createPresignedReadUrl({ key: path, expiresIn: readExpiresIn }),
    storage.createPresignedPutUrl({
      key: path,
      contentType: mimeType,
      metadata,
      expiresIn: writeExpiresIn,
    }),
  ]);

  const uploadResponse = await fetch(writeUrl, {
    method: "PUT",
    headers: {
      "Content-Type": mimeType,
    },
    body: videoData,
  });

  if (!uploadResponse.ok) {
    throw new Error(
      `Failed to upload video: ${uploadResponse.status} ${uploadResponse.statusText}`,
    );
  }

  return {
    url: readUrl,
    key: path,
  };
}
