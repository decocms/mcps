export interface S3Config {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  bucketName: string;
  defaultPresignedUrlExpiration?: number;
}

export interface FileSystemUrlResponse {
  url: string;
}

export interface FileSystemBinding {
  FS_READ: (input: {
    path: string;
    expiresIn?: number;
  }) => Promise<FileSystemUrlResponse>;
  FS_WRITE: (input: {
    path: string;
    expiresIn?: number;
    contentType: string;
    metadata?: Record<string, string>;
  }) => Promise<FileSystemUrlResponse>;
  FS_DELETE: (input: { path: string }) => Promise<{}>;
  FS_LIST: (input: { prefix: string }) => Promise<{
    items: unknown[];
  }>;
  FS_READ_METADATA: (input: { path: string }) => Promise<{}>;
}
