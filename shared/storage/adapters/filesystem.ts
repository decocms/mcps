import type { ObjectStorage } from "../interface.ts";
import type { FileSystemBinding } from "../types.ts";
export class FileSystemStorageAdapter implements ObjectStorage {
  constructor(private fileSystem: FileSystemBinding) {}

  async getReadUrl(path: string, expiresIn: number): Promise<string> {
    const { url } = await this.fileSystem.FS_READ({ path, expiresIn });
    return url;
  }

  async getWriteUrl(
    path: string,
    options: {
      contentType?: string;
      metadata?: Record<string, string>;
      expiresIn: number;
    },
  ): Promise<string> {
    const { url } = await this.fileSystem.FS_WRITE({
      path,
      ...options,
    });
    return url;
  }
}
