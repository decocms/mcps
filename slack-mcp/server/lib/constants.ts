/**
 * Constants
 *
 * Centralized configuration values for the Slack MCP.
 */

/**
 * Cache TTL values in milliseconds
 */
export const CACHE_TTL = {
  /** Channel list cache (1 minute) */
  CHANNELS: 60_000,
  /** User list cache (1 minute) */
  USERS: 60_000,
  /** Individual user info cache (5 minutes) */
  USER_INFO: 300_000,
  /** Channel info cache (5 minutes) */
  CHANNEL_INFO: 300_000,
} as const;

/**
 * API rate limiting configuration
 */
export const RATE_LIMIT = {
  /** Maximum retry attempts for rate-limited requests */
  MAX_RETRIES: 3,
  /** Initial delay between retries (ms) */
  INITIAL_DELAY_MS: 1000,
  /** Maximum delay between retries (ms) */
  MAX_DELAY_MS: 30_000,
  /** Multiplier for exponential backoff */
  BACKOFF_MULTIPLIER: 2,
} as const;

/**
 * Slack API limits
 */
export const SLACK_LIMITS = {
  /** Maximum message length */
  MAX_MESSAGE_LENGTH: 40_000,
  /** Maximum block kit elements */
  MAX_BLOCKS: 50,
  /** Maximum text in a single block */
  MAX_BLOCK_TEXT_LENGTH: 3000,
  /** Maximum file upload size (bytes) - 1GB */
  MAX_FILE_SIZE: 1_073_741_824,
  /** Maximum attachments per message */
  MAX_ATTACHMENTS: 100,
} as const;

/**
 * Default pagination limits
 */
export const PAGINATION = {
  /** Default channels per request */
  CHANNELS: 200,
  /** Default users per request */
  USERS: 100,
  /** Default messages per request */
  MESSAGES: 100,
  /** Default channel members per request */
  MEMBERS: 100,
} as const;

/**
 * HTTP status codes for rate limiting
 */
export const HTTP_STATUS = {
  TOO_MANY_REQUESTS: 429,
  OK: 200,
} as const;
