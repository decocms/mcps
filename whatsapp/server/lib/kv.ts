/**
 * Simple Key-Value Store Interface
 *
 * A minimal interface for implementing KV storage clients.
 * Can be backed by Redis, Cloudflare KV, DynamoDB, in-memory, etc.
 */

export interface KVGetOptions {
  /** Return raw buffer instead of parsed JSON */
  raw?: boolean;
}

export interface KVSetOptions {
  /** Time-to-live in seconds */
  ttl?: number;
  /** Expiration timestamp (Unix epoch in seconds) */
  expiresAt?: number;
}

export interface KVListOptions {
  /** Filter keys by prefix */
  prefix?: string;
  /** Maximum number of keys to return */
  limit?: number;
  /** Cursor for pagination */
  cursor?: string;
}

export interface KVListResult {
  keys: string[];
  cursor?: string;
  done: boolean;
}

export interface KV {
  /**
   * Get a value by key
   * @returns The value, or null if not found
   */
  get<T = unknown>(key: string, options?: KVGetOptions): Promise<T | null>;

  /**
   * Set a value by key
   */
  set<T = unknown>(
    key: string,
    value: T,
    options?: KVSetOptions,
  ): Promise<void>;

  /**
   * Delete a key
   * @returns true if the key existed and was deleted
   */
  delete(key: string): Promise<boolean>;

  /**
   * Check if a key exists
   */
  has(key: string): Promise<boolean>;

  /**
   * List keys with optional filtering
   */
  list(options?: KVListOptions): Promise<KVListResult>;
}
