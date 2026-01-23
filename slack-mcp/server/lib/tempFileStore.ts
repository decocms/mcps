/**
 * Temporary File Store
 *
 * Stores files in memory with automatic cleanup for Whisper transcription
 */

interface TempFile {
  data: string; // base64
  mimeType: string;
  name: string;
  createdAt: number;
}

// Store files in memory with TTL
const store = new Map<string, TempFile>();

// Cleanup interval (5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;
const FILE_TTL = 10 * 60 * 1000; // 10 minutes TTL

/**
 * Store a file temporarily and return its ID
 */
export function storeTempFile(
  data: string,
  mimeType: string,
  name: string,
): string {
  const id = crypto.randomUUID();

  store.set(id, {
    data,
    mimeType,
    name,
    createdAt: Date.now(),
  });

  console.log(`[TempStore] Stored file: ${id} (${name}, ${mimeType})`);

  return id;
}

/**
 * Retrieve a temporary file by ID
 */
export function getTempFile(id: string): TempFile | null {
  const file = store.get(id);

  if (!file) {
    console.log(`[TempStore] File not found: ${id}`);
    return null;
  }

  // Check if expired
  if (Date.now() - file.createdAt > FILE_TTL) {
    console.log(`[TempStore] File expired: ${id}`);
    store.delete(id);
    return null;
  }

  console.log(`[TempStore] Retrieved file: ${id} (${file.name})`);
  return file;
}

/**
 * Delete a temporary file
 */
export function deleteTempFile(id: string): boolean {
  const deleted = store.delete(id);
  if (deleted) {
    console.log(`[TempStore] Deleted file: ${id}`);
  }
  return deleted;
}

/**
 * Cleanup expired files
 */
function cleanupExpiredFiles(): void {
  const now = Date.now();
  let cleaned = 0;

  for (const [id, file] of store.entries()) {
    if (now - file.createdAt > FILE_TTL) {
      store.delete(id);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[TempStore] Cleaned up ${cleaned} expired files`);
  }
}

/**
 * Get store stats
 */
export function getTempStoreStats() {
  return {
    fileCount: store.size,
    files: Array.from(store.entries()).map(([id, file]) => ({
      id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.data.length,
      age: Date.now() - file.createdAt,
    })),
  };
}

// Start cleanup interval
setInterval(cleanupExpiredFiles, CLEANUP_INTERVAL);

console.log(
  `[TempStore] Initialized (TTL: ${FILE_TTL / 1000}s, cleanup interval: ${CLEANUP_INTERVAL / 1000}s)`,
);

