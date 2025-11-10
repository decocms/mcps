export interface FileSystemBinding {
  FS_READ: (input: {
    path: string;
    expiresIn?: number;
  }) => Promise<{ url: string }>;
  FS_WRITE: (input: {
    path: string;
    expiresIn?: number;
    contentType: string;
    metadata?: Record<string, string>;
  }) => Promise<{ url: string }>;
  FS_DELETE: (input: { path: string }) => Promise<{}>;
  FS_LIST: (input: { prefix: string }) => Promise<{
    items: unknown[];
  }>;
  FS_READ_METADATA: (input: { path: string }) => Promise<{}>;
}
