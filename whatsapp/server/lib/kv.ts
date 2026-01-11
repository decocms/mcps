import { Redis } from "@upstash/redis";

const getRedisClient = () => {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
};

export interface KVStore {
  set<T>(key: string, value: T, options?: { ex?: number }): Promise<void>;
  get<T>(key: string): Promise<T | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export const getKvStore = (): KVStore => {
  // Only support redis for now
  const redis = getRedisClient();

  return {
    set: async (key, value, options) => {
      await redis.set(key, value, options?.ex ? { ex: options.ex } : undefined);
    },
    get: async (key) => {
      return await redis.get(key);
    },
    delete: async (key) => {
      await redis.del(key);
    },
    exists: async (key) => {
      const result = await redis.exists(key);
      return result === 1;
    },
  };
};
