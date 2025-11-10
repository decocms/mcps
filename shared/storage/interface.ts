export interface ObjectStorage {
  createPresignedReadUrl(options: {
    key: string;
    expiresIn?: number;
  }): Promise<string>;

  createPresignedPutUrl(options: {
    key: string;
    contentType?: string;
    metadata?: Record<string, string>;
    expiresIn: number;
  }): Promise<string>;

  listObjects?(options: {
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
  }>;

  getMetadata?(options: { key: string }): Promise<{
    contentType?: string;
    contentLength: number;
    lastModified: Date;
    etag: string;
    metadata?: Record<string, string>;
  }>;

  deleteObject?(options: { key: string }): Promise<void>;

  deleteObjects?(options: { keys: string[] }): Promise<{
    deleted: string[];
    errors: Array<{ key: string; message: string }>;
  }>;
}
