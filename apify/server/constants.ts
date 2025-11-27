// Apify API constants
export const APIFY_API_BASE_URL = "https://api.apify.com";

export const APIFY_ERROR_MESSAGES = {
  PERMISSION_DENIED:
    "Access denied to Apify. Check your permissions and API token.",
  NOT_FOUND: "Resource not found. Check the provided ID.",
  INVALID_ARGUMENT: "Invalid argument in the request. Check the parameters.",
  FAILED_PRECONDITION: "Operation not allowed in the current state.",
  RESOURCE_EXHAUSTED: "Apify API request limit exceeded. Try again later.",
  UNAUTHENTICATED: "Apify API authentication failed. Check your API token.",
  QUOTA_EXCEEDED: "Apify API quota exceeded. Try again later.",
  ALREADY_EXISTS: "Resource already exists.",
  DEADLINE_EXCEEDED: "Operation timed out. Try again.",
  UNAVAILABLE: "Apify service temporarily unavailable. Try again later.",
  INVALID_VALUE: "One or more values in your request are invalid.",
  ACTOR_NOT_FOUND: "Actor not found or inaccessible.",
  RUN_NOT_FOUND: "Run not found.",
  INVALID_TOKEN: "API token is invalid or expired.",
  INSUFFICIENT_CREDIT: "Insufficient credits to perform this operation.",
} as const;

// Contract clause IDs
export const CONTRACT_CLAUSES = {
  COMPUTE_UNITS: "apify:computeUnits",
  MEMORY_MB: "apify:memoryMB",
} as const;
