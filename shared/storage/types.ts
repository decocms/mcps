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
    expiresIn: number;
  }) => Promise<FileSystemUrlResponse>;
  FS_WRITE: (input: {
    path: string;
    metadata?: Record<string, string>;
    contentType?: string;
    expiresIn: number;
  }) => Promise<FileSystemUrlResponse>;
}

