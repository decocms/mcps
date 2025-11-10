import { FileSystemStorageAdapter } from "./adapters/filesystem.ts";
import type { FileSystemBinding } from "./types.ts";

export function createFileSystemStorage(
  fileSystem: FileSystemBinding,
): FileSystemStorageAdapter {
  return new FileSystemStorageAdapter(fileSystem);
}
