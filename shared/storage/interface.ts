export interface ObjectStorage {
  getReadUrl(path: string, expiresIn: number): Promise<string>;
  getWriteUrl(
    path: string,
    options: {
      contentType?: string;
      metadata?: Record<string, string>;
      expiresIn: number;
    },
  ): Promise<string>;
}

export interface ExtendedObjectStorage extends ObjectStorage {
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

  getMetadata?(key: string): Promise<{
    contentType?: string;
    contentLength: number;
    lastModified: Date;
    etag: string;
    metadata?: Record<string, string>;
  }>;

  deleteObject?(key: string): Promise<void>;

  deleteObjects?(keys: string[]): Promise<{
    deleted: string[];
    errors: Array<{ key: string; message: string }>;
  }>;
}
