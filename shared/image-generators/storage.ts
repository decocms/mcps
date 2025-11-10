import type { ObjectStorage } from "@decocms/mcps-shared/storage";

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
  key: string;
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
    storage.createPresignedReadUrl({ key: path, expiresIn: readExpiresIn }),
    storage.createPresignedPutUrl({
      key: path,
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
    key: path,
  };
}
