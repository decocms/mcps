/**
 * Redis Store - Persistent storage for multi-pod deployments
 *
 * Replaces local KV store with Redis for shared state across K8s pods.
 * This ensures:
 * - Configuration persists across deployments
 * - All pods share the same connection configs
 * - Tokens and credentials survive pod restarts
 * - No sync issues between pods
 */

import Redis, { type RedisOptions } from "ioredis";

export interface RedisConfig {
  url: string;
  password?: string;
  db?: number;
  keyPrefix?: string;
  ttlSeconds?: number;
}

/**
 * Redis Store Client
 */
class RedisStore {
  private client: Redis | null = null;
  private config: RedisConfig | null = null;
  private defaultTTL: number | null = null;

  /**
   * Initialize Redis connection
   */
  async initialize(config: RedisConfig): Promise<void> {
    if (this.client) {
      console.log("[Redis] Already initialized, skipping...");
      return;
    }

    this.config = config;
    this.defaultTTL = config.ttlSeconds ?? null;

    try {
      // Parse Redis URL
      const url = new URL(config.url);
      const options: RedisOptions = {
        host: url.hostname,
        port: url.port ? Number.parseInt(url.port) : 6379,
        password: config.password || url.password || undefined,
        db: config.db ?? 0,
        keyPrefix: config.keyPrefix || "slack-mcp:",
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          console.log(
            `[Redis] Reconnecting... attempt ${times}, delay ${delay}ms`,
          );
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false,
      };

      // Handle TLS for rediss:// URLs
      if (url.protocol === "rediss:") {
        options.tls = {};
      }

      this.client = new Redis(options);

      // Event handlers
      this.client.on("connect", () => {
        console.log("[Redis] ✅ Connected successfully");
      });

      this.client.on("ready", () => {
        console.log("[Redis] ✅ Ready to accept commands");
      });

      this.client.on("error", (err) => {
        console.error("[Redis] ❌ Error:", err.message);
      });

      this.client.on("close", () => {
        console.log("[Redis] Connection closed");
      });

      this.client.on("reconnecting", () => {
        console.log("[Redis] Reconnecting...");
      });

      // Wait for connection
      await this.client.ping();
      console.log("[Redis] 🎉 Initialization complete");
    } catch (error) {
      console.error("[Redis] ❌ Failed to initialize:", error);
      throw error;
    }
  }

  /**
   * Check if Redis is initialized and connected
   */
  isInitialized(): boolean {
    return this.client !== null && this.client.status === "ready";
  }

  /**
   * Get value from Redis
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.client) {
      throw new Error("Redis not initialized");
    }

    try {
      const value = await this.client.get(key);
      if (!value) {
        return null;
      }

      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`[Redis] Error getting key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Set value in Redis
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    if (!this.client) {
      throw new Error("Redis not initialized");
    }

    try {
      const serialized = JSON.stringify(value);
      const ttl = ttlSeconds ?? this.defaultTTL;

      if (ttl) {
        await this.client.setex(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }
    } catch (error) {
      console.error(`[Redis] Error setting key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Delete value from Redis
   */
  async delete(key: string): Promise<void> {
    if (!this.client) {
      throw new Error("Redis not initialized");
    }

    try {
      await this.client.del(key);
    } catch (error) {
      console.error(`[Redis] Error deleting key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.client) {
      throw new Error("Redis not initialized");
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`[Redis] Error checking key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get all keys matching pattern
   */
  async keys(pattern: string): Promise<string[]> {
    if (!this.client) {
      throw new Error("Redis not initialized");
    }

    try {
      // Remove keyPrefix from pattern as ioredis will add it automatically
      const keys = await this.client.keys(pattern);
      return keys;
    } catch (error) {
      console.error(
        `[Redis] Error getting keys with pattern ${pattern}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Set TTL for existing key
   */
  async expire(key: string, seconds: number): Promise<void> {
    if (!this.client) {
      throw new Error("Redis not initialized");
    }

    try {
      await this.client.expire(key, seconds);
    } catch (error) {
      console.error(`[Redis] Error setting TTL for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get multiple values at once
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (!this.client) {
      throw new Error("Redis not initialized");
    }

    if (keys.length === 0) {
      return [];
    }

    try {
      const values = await this.client.mget(...keys);
      return values.map((value) => {
        if (!value) return null;
        try {
          return JSON.parse(value) as T;
        } catch {
          return null;
        }
      });
    } catch (error) {
      console.error("[Redis] Error getting multiple keys:", error);
      throw error;
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      console.log("[Redis] Connection closed");
    }
  }

  /**
   * Get Redis client info (for debugging)
   */
  getInfo(): { connected: boolean; config: RedisConfig | null } {
    return {
      connected: this.isInitialized(),
      config: this.config,
    };
  }
}

// Singleton instance
let redisStore: RedisStore | null = null;

/**
 * Get Redis store instance
 */
export function getRedisStore(): RedisStore {
  if (!redisStore) {
    redisStore = new RedisStore();
  }
  return redisStore;
}

/**
 * Initialize Redis store with config
 */
export async function initializeRedisStore(config: RedisConfig): Promise<void> {
  const store = getRedisStore();
  await store.initialize(config);
}

/**
 * Check if Redis is available and initialized
 */
export function isRedisInitialized(): boolean {
  return redisStore?.isInitialized() ?? false;
}

/**
 * Close Redis store (for testing/cleanup)
 */
export async function closeRedisStore(): Promise<void> {
  if (redisStore) {
    await redisStore.close();
    redisStore = null;
  }
}
