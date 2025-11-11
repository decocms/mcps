import type { ObjectStorage } from "../interface.ts";
import type { FileSystemBinding } from "../types.ts";

export class FileSystemStorageAdapter implements ObjectStorage {
  constructor(private fileSystem: FileSystemBinding) {}

  async createPresignedReadUrl(options: {
    key: string;
    expiresIn?: number;
  }): Promise<string> {
    const { url } = await this.fileSystem.FS_READ({
      path: options.key,
      expiresIn: options.expiresIn || 3600,
    });
    return url;
  }

  async createPresignedPutUrl(options: {
    key: string;
    contentType?: string;
    metadata?: Record<string, string>;
    expiresIn: number;
  }): Promise<string> {
    const { url } = await this.fileSystem.FS_WRITE({
      path: options.key,
      metadata: options.metadata,
      contentType: options.contentType || "application/octet-stream",
      expiresIn: options.expiresIn,
    });
    return url;
  }

  async listObjects(options: {
    prefix?: string;
    maxKeys?: number;
    continuationToken?: string;
  }): Promise<{
    objects: Array<{
      key: string;
      size: number;
      lastModified: Date;
      etag: string;
    }>;
    nextContinuationToken?: string;
    isTruncated: boolean;
  }> {
    const { items } = await this.fileSystem.FS_LIST({
      prefix: options.prefix || "",
    });
    // Convert items to objects format
    const objects = (items as any[]).map((item: any) => ({
      key: item.key || "",
      size: item.size || 0,
      lastModified: item.lastModified
        ? new Date(item.lastModified)
        : new Date(),
      etag: item.etag || "",
    }));
    return { objects, isTruncated: false };
  }

  async getMetadata(options: { key: string }): Promise<{
    contentType?: string;
    contentLength: number;
    lastModified: Date;
    etag: string;
    metadata?: Record<string, string>;
  }> {
    const result = (await this.fileSystem.FS_READ_METADATA({
      path: options.key,
    })) as any;
    return {
      contentType: result.contentType,
      contentLength: result.contentLength || 0,
      lastModified: result.lastModified
        ? new Date(result.lastModified)
        : new Date(),
      etag: result.etag || "",
      metadata: result.metadata,
    };
  }

  async deleteObject(options: { key: string }): Promise<void> {
    await this.fileSystem.FS_DELETE({ path: options.key });
  }

  async deleteObjects(options: { keys: string[] }): Promise<{
    deleted: string[];
    errors: Array<{ key: string; message: string }>;
  }> {
    await Promise.all(
      options.keys.map((key) => this.fileSystem.FS_DELETE({ path: key })),
    );
    return { deleted: options.keys, errors: [] };
  }
}

export const adaptFileSystemBindingToObjectStorage = (
  fileSystem: FileSystemBinding,
): ObjectStorage => {
  return new FileSystemStorageAdapter(fileSystem);
};
