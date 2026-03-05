/**
 * Input Sanitization Utilities
 *
 * Protects against path traversal and injection attacks by validating
 * and sanitizing user-provided values that are used in URL paths.
 */

/**
 * Sanitize a single path segment (e.g. an ID, content type name).
 *
 * Blocks:
 * - Path traversal sequences (`..`, `./`, `..\`)
 * - Absolute paths (leading `/`)
 * - URL-encoded traversals (`%2e%2e`, `%2f`)
 * - Null bytes
 *
 * Allows:
 * - Alphanumeric, hyphens, underscores, dots (for UIDs like `api::article.article`)
 * - Colons (for Strapi UIDs)
 *
 * @param value - The raw user input
 * @param paramName - Name of the parameter (for error messages)
 * @returns The sanitized value
 * @throws Error if the value contains traversal sequences
 */
export function sanitizePathSegment(
  value: string | number,
  paramName: string,
): string {
  const str = String(value);

  // Block null bytes
  if (str.includes("\0")) {
    throw new Error(
      `Parâmetro '${paramName}' contém caracteres inválidos (null byte)`,
    );
  }

  // Decode URL-encoded characters for inspection
  let decoded: string;
  try {
    decoded = decodeURIComponent(str);
  } catch {
    decoded = str;
  }

  // Block path traversal patterns
  if (
    decoded.includes("..") ||
    decoded.includes("./") ||
    decoded.includes(".\\")
  ) {
    throw new Error(
      `Parâmetro '${paramName}' contém sequência de path traversal não permitida`,
    );
  }

  // Block absolute paths
  if (str.startsWith("/") || str.startsWith("\\")) {
    throw new Error(
      `Parâmetro '${paramName}' não pode começar com barra (path absoluto)`,
    );
  }

  // Validate characters: only allow safe chars for Strapi API paths
  // Allowed: alphanumeric, hyphens, underscores, dots, colons (for UIDs)
  const SAFE_PATH_PATTERN = /^[a-zA-Z0-9\-_.:]+$/;
  if (!SAFE_PATH_PATTERN.test(str)) {
    throw new Error(
      `Parâmetro '${paramName}' contém caracteres não permitidos. Apenas letras, números, hífens, underscores, pontos e dois-pontos são aceitos.`,
    );
  }

  return str;
}

/**
 * Maximum file size for URL-based uploads (50 MB).
 */
export const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;
