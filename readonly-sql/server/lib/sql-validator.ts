/**
 * SQL Query Validator
 *
 * Validates SQL queries to ensure they are read-only and safe to execute.
 */

/**
 * List of SQL keywords that indicate write operations.
 * These should be blocked to ensure read-only access.
 */
const WRITE_KEYWORDS = [
  // Data modification
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "MERGE",
  "UPSERT",
  // Schema modification
  "CREATE",
  "ALTER",
  "DROP",
  "RENAME",
  // Transaction control
  "COMMIT",
  "ROLLBACK",
  "SAVEPOINT",
  // Permission/security
  "GRANT",
  "REVOKE",
  // Database operations
  "BACKUP",
  "RESTORE",
  // Procedural
  "EXEC",
  "EXECUTE",
  "CALL",
];

/**
 * Patterns that might indicate dangerous SQL constructs
 */
const DANGEROUS_PATTERNS = [
  /;\s*(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)/i,
  /INTO\s+OUTFILE/i,
  /INTO\s+DUMPFILE/i,
  /LOAD_FILE/i,
  /\bXP_CMDSHELL\b/i,
];

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates if a SQL query is safe for read-only execution.
 *
 * @param query - The SQL query to validate
 * @returns ValidationResult with isValid flag and any error messages
 */
export function validateReadOnlyQuery(query: string): ValidationResult {
  const errors: string[] = [];
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    errors.push("Query cannot be empty");
    return { isValid: false, errors };
  }

  // Remove comments to avoid false positives
  const withoutComments = removeComments(normalizedQuery);

  // Check for write keywords at the start of statements
  const statements = withoutComments.split(";").filter((s) => s.trim());

  for (const statement of statements) {
    const trimmedStatement = statement.trim();
    if (!trimmedStatement) continue;

    // Get the first word of the statement (the command)
    const firstWord = trimmedStatement.split(/\s+/)[0].toUpperCase();

    // Check if the first word is a write operation
    if (WRITE_KEYWORDS.includes(firstWord)) {
      errors.push(
        `Query contains prohibited operation: ${firstWord}. Only SELECT and other read-only operations are allowed.`,
      );
    }

    // Additional check for write keywords anywhere in the query
    // (could be in subqueries or CTEs)
    for (const keyword of WRITE_KEYWORDS) {
      const regex = new RegExp(`\\b${keyword}\\b`, "i");
      if (regex.test(trimmedStatement)) {
        errors.push(
          `Query contains prohibited keyword: ${keyword}. Only read-only operations are allowed.`,
        );
        break; // Only report once per statement
      }
    }

    // Check for dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(trimmedStatement)) {
        errors.push(
          `Query contains potentially dangerous pattern that is not allowed.`,
        );
        break;
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Removes SQL comments from a query string.
 * Handles both single-line (--) and multi-line (/* *\/) comments.
 *
 * @param query - The SQL query to process
 * @returns Query with comments removed
 */
function removeComments(query: string): string {
  // Remove multi-line comments /* */
  let result = query.replace(/\/\*[\s\S]*?\*\//g, " ");

  // Remove single-line comments --
  result = result.replace(/--[^\n]*/g, " ");

  return result;
}
