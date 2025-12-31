/**
 * SQL Query Builder Utilities
 *
 * Shared utilities for building SQL queries from collection filter expressions.
 * Used by collection CRUD implementations (agents, prompts, etc.)
 */

// ============================================================================
// Types
// ============================================================================

export type WhereExpression = {
  field?: string[];
  operator?: string;
  value?: unknown;
  conditions?: WhereExpression[];
};

export type OrderByExpression = Array<{
  field: string[];
  direction: string;
  nulls?: string;
}>;

// ============================================================================
// Validation
// ============================================================================

/**
 * Valid SQL identifier pattern: alphanumeric and underscores only
 */
const VALID_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Validate and sanitize a SQL identifier (column/field name)
 * Prevents SQL injection by ensuring only valid identifier characters
 */
function sanitizeIdentifier(name: string): string {
  if (!VALID_IDENTIFIER_PATTERN.test(name)) {
    throw new Error(
      `Invalid SQL identifier: "${name}". Only alphanumeric characters and underscores are allowed.`,
    );
  }
  return name;
}

/**
 * Validate sort direction
 */
function sanitizeDirection(direction: string): "ASC" | "DESC" {
  const upper = direction.toUpperCase();
  if (upper !== "ASC" && upper !== "DESC") {
    throw new Error(
      `Invalid sort direction: "${direction}". Must be "ASC" or "DESC".`,
    );
  }
  return upper;
}

/**
 * Validate nulls ordering
 */
function sanitizeNulls(nulls: string): "FIRST" | "LAST" {
  const upper = nulls.toUpperCase();
  if (upper !== "FIRST" && upper !== "LAST") {
    throw new Error(
      `Invalid nulls ordering: "${nulls}". Must be "FIRST" or "LAST".`,
    );
  }
  return upper;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build SQL WHERE clause from filter expression using ? placeholders
 */
export function buildWhereClause(
  whereExpr: WhereExpression | undefined,
  params: unknown[] = [],
): { clause: string; params: unknown[] } {
  if (!whereExpr) {
    return { clause: "", params };
  }

  // Simple condition
  if (
    "field" in whereExpr &&
    "operator" in whereExpr &&
    !("conditions" in whereExpr)
  ) {
    const fieldPath = whereExpr.field;
    if (!fieldPath || fieldPath.length === 0) return { clause: "", params };
    const fieldName = sanitizeIdentifier(fieldPath[fieldPath.length - 1]);

    switch (whereExpr.operator) {
      case "eq":
        params.push(whereExpr.value);
        return { clause: `${fieldName} = ?`, params };
      case "gt":
        params.push(whereExpr.value);
        return { clause: `${fieldName} > ?`, params };
      case "gte":
        params.push(whereExpr.value);
        return { clause: `${fieldName} >= ?`, params };
      case "lt":
        params.push(whereExpr.value);
        return { clause: `${fieldName} < ?`, params };
      case "lte":
        params.push(whereExpr.value);
        return { clause: `${fieldName} <= ?`, params };
      case "in": {
        const values = Array.isArray(whereExpr.value)
          ? whereExpr.value
          : [whereExpr.value];
        const placeholders = values.map(() => "?").join(", ");
        params.push(...values);
        return { clause: `${fieldName} IN (${placeholders})`, params };
      }
      case "like":
      case "contains":
        params.push(`%${whereExpr.value}%`);
        return { clause: `${fieldName} LIKE ?`, params };
      default:
        throw new Error(`Unsupported operator: ${whereExpr.operator}`);
    }
  }

  // Logical condition (and, or, not)
  if ("operator" in whereExpr && "conditions" in whereExpr) {
    const conditions = (whereExpr.conditions || []).map((cond) => {
      const result = buildWhereClause(cond, params);
      params = result.params;
      return result.clause;
    });

    switch (whereExpr.operator) {
      case "and":
        return { clause: `(${conditions.join(" AND ")})`, params };
      case "or":
        return { clause: `(${conditions.join(" OR ")})`, params };
      case "not":
        return { clause: `NOT (${conditions[0]})`, params };
      default:
        throw new Error(`Unsupported logical operator: ${whereExpr.operator}`);
    }
  }

  return { clause: "", params };
}

/**
 * Build SQL ORDER BY clause from sort expression
 */
export function buildOrderByClause(
  orderByExpr: OrderByExpression | undefined,
): string {
  if (!orderByExpr || orderByExpr.length === 0) {
    return "ORDER BY created_at DESC";
  }

  const orderClauses = orderByExpr.map((order) => {
    const fieldPath = order.field;
    if (!fieldPath || fieldPath.length === 0) {
      throw new Error("ORDER BY field path cannot be empty");
    }
    const fieldName = sanitizeIdentifier(fieldPath[fieldPath.length - 1]);
    const direction = sanitizeDirection(order.direction);
    const nulls = order.nulls ? ` NULLS ${sanitizeNulls(order.nulls)}` : "";
    return `${fieldName} ${direction}${nulls}`;
  });

  return `ORDER BY ${orderClauses.join(", ")}`;
}
