/**
 * SQL Query Builder Helpers
 *
 * Shared utilities for building SQL WHERE and ORDER BY clauses.
 */

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

/**
 * Check if a where expression is empty (no meaningful filters)
 */
function isEmptyWhereExpression(whereExpr: WhereExpression): boolean {
  // Empty object
  if (Object.keys(whereExpr).length === 0) return true;

  // Has operator but no field (for simple conditions) and no conditions (for logical)
  if (!whereExpr.field && !whereExpr.conditions) return true;

  // Logical condition with empty conditions array
  if (whereExpr.conditions && whereExpr.conditions.length === 0) return true;

  return false;
}

/**
 * Build SQL WHERE clause from filter expression using ? placeholders
 *
 * Supported simple operators: eq, gt, gte, lt, lte, in, like, contains
 * Supported logical operators: and, or, not
 *
 * @example Simple condition
 * { field: ["status"], operator: "eq", value: "active" }
 *
 * @example Logical AND
 * { operator: "and", conditions: [
 *   { field: ["status"], operator: "eq", value: "active" },
 *   { field: ["type"], operator: "in", value: ["A", "B"] }
 * ]}
 */
export function buildWhereClause(
  whereExpr: WhereExpression | undefined,
  params: unknown[] = [],
): { clause: string; params: unknown[] } {
  if (!whereExpr) {
    return { clause: "", params };
  }

  // Handle empty where expressions gracefully
  if (isEmptyWhereExpression(whereExpr)) {
    return { clause: "", params };
  }

  // Simple condition
  if (
    "field" in whereExpr &&
    "operator" in whereExpr &&
    !("conditions" in whereExpr)
  ) {
    const fieldPath = whereExpr.field;
    if (!fieldPath) return { clause: "", params };
    const fieldName = fieldPath[fieldPath.length - 1];

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
        // Create placeholders for each value in the IN clause
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
    const conditions = (whereExpr.conditions || [])
      .map((cond) => {
        const result = buildWhereClause(cond, params);
        params = result.params;
        return result.clause;
      })
      .filter(Boolean); // Filter out empty clauses

    // If all conditions resolved to empty, return empty
    if (conditions.length === 0) {
      return { clause: "", params };
    }

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
    const fieldName = fieldPath[fieldPath.length - 1];
    const direction = order.direction.toUpperCase();
    const nulls = order.nulls ? ` NULLS ${order.nulls.toUpperCase()}` : "";
    return `${fieldName} ${direction}${nulls}`;
  });

  return `ORDER BY ${orderClauses.join(", ")}`;
}
