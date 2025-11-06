/**
 * S3 Client factory for creating S3 clients from state configuration.
 * Supports any S3-compatible storage provider including AWS S3, R2, MinIO, etc.
 */
import { S3Client } from "@aws-sdk/client-s3";
import type { Env } from "../main.ts";

/**
 * Creates an S3Client instance from the state configuration.
 * Supports custom endpoints for S3-compatible storage providers.
 *
 * @param env - The environment containing state configuration
 * @returns Configured S3Client instance
 */
export function createS3Client(env: Env): S3Client {
  const state = env.DECO_CHAT_REQUEST_CONTEXT.state;

  const config: ConstructorParameters<typeof S3Client>[0] = {
    region: state.region,
    credentials: {
      accessKeyId: state.accessKeyId,
      secretAccessKey: state.secretAccessKey,
    },
  };

  // Add custom endpoint if provided (for S3-compatible storage like R2, MinIO, etc.)
  if (state.endpoint) {
    config.endpoint = state.endpoint;
    // For S3-compatible services, we often need to force path style
    config.forcePathStyle = true;
  }

  return new S3Client(config);
}

/**
 * Gets the default presigned URL expiration from state or returns default.
 *
 * @param env - The environment containing state configuration
 * @param overrideExpiration - Optional override expiration in seconds
 * @returns Expiration time in seconds
 */
export function getPresignedUrlExpiration(
  env: Env,
  overrideExpiration?: number,
): number {
  if (overrideExpiration !== undefined) {
    return overrideExpiration;
  }

  const state = env.DECO_CHAT_REQUEST_CONTEXT.state;
  return state.defaultPresignedUrlExpiration ?? 3600; // Default to 1 hour
}
