import { S3StorageAdapter } from "./adapters/s3.ts";
import { FileSystemStorageAdapter } from "./adapters/filesystem.ts";
import type { ObjectStorage } from "./interface.ts";
import type { S3Config, FileSystemBinding } from "./types.ts";
export function createStorageFromState(state: {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  bucketName: string;
  defaultPresignedUrlExpiration?: number;
}): S3StorageAdapter {
  return new S3StorageAdapter({
    region: state.region,
    accessKeyId: state.accessKeyId,
    secretAccessKey: state.secretAccessKey,
    endpoint: state.endpoint,
    bucketName: state.bucketName,
    defaultPresignedUrlExpiration: state.defaultPresignedUrlExpiration,
  });
}

export function createS3Storage(config: S3Config): S3StorageAdapter {
  return new S3StorageAdapter(config);
}

export function createFileSystemStorage(
  fileSystem: FileSystemBinding,
): FileSystemStorageAdapter {
  return new FileSystemStorageAdapter(fileSystem);
}
export function createStorageFromEnv(env: {
  FILE_SYSTEM?: FileSystemBinding;
  DECO_CHAT_REQUEST_CONTEXT?: {
    state?: {
      region?: string;
      accessKeyId?: string;
      secretAccessKey?: string;
      endpoint?: string;
      bucketName?: string;
      defaultPresignedUrlExpiration?: number;
    };
  };
}): ObjectStorage {
  if (env.FILE_SYSTEM) {
    return new FileSystemStorageAdapter(env.FILE_SYSTEM);
  }

  const state = env.DECO_CHAT_REQUEST_CONTEXT?.state;
  if (
    state?.region &&
    state?.accessKeyId &&
    state?.secretAccessKey &&
    state?.bucketName
  ) {
    return createStorageFromState(state as any);
  }

  throw new Error(
    "No storage configuration found. Please configure either FILE_SYSTEM binding or S3 state.",
  );
}
