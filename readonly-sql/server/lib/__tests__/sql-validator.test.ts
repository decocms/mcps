/**
 * Tests for SQL Query Validator
 *
 * Run with: bun test
 */

import { describe, test, expect } from "bun:test";
import { validateReadOnlyQuery } from "../sql-validator.ts";

describe("SQL Validator", () => {
  describe("Valid Read-Only Queries", () => {
    test("should allow simple SELECT query", () => {
      const result = validateReadOnlyQuery("SELECT * FROM users");
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("should allow SELECT with WHERE clause", () => {
      const result = validateReadOnlyQuery(
        "SELECT id, name FROM users WHERE active = true",
      );
      expect(result.isValid).toBe(true);
    });

    test("should allow SELECT with JOIN", () => {
      const result = validateReadOnlyQuery(`
        SELECT u.name, o.total 
        FROM users u 
        JOIN orders o ON u.id = o.user_id
      `);
      expect(result.isValid).toBe(true);
    });

    test("should allow SELECT with aggregation", () => {
      const result = validateReadOnlyQuery(
        "SELECT COUNT(*), AVG(price) FROM products GROUP BY category",
      );
      expect(result.isValid).toBe(true);
    });

    test("should allow CTE (WITH clause)", () => {
      const result = validateReadOnlyQuery(`
        WITH monthly_sales AS (
          SELECT DATE_TRUNC('month', created_at) as month, SUM(total) as sales
          FROM orders
          GROUP BY month
        )
        SELECT * FROM monthly_sales
      `);
      expect(result.isValid).toBe(true);
    });

    test("should allow EXPLAIN", () => {
      const result = validateReadOnlyQuery("EXPLAIN SELECT * FROM users");
      expect(result.isValid).toBe(true);
    });

    test("should allow SHOW commands", () => {
      const result = validateReadOnlyQuery("SHOW TABLES");
      expect(result.isValid).toBe(true);
    });

    test("should allow DESCRIBE", () => {
      const result = validateReadOnlyQuery("DESCRIBE users");
      expect(result.isValid).toBe(true);
    });

    test("should allow query with comments", () => {
      const result = validateReadOnlyQuery(`
        -- This is a comment
        SELECT * FROM users /* inline comment */
        WHERE id = 1
      `);
      expect(result.isValid).toBe(true);
    });
  });

  describe("Invalid Write Queries", () => {
    test("should reject INSERT", () => {
      const result = validateReadOnlyQuery(
        "INSERT INTO users (name) VALUES ('John')",
      );
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("INSERT");
    });

    test("should reject UPDATE", () => {
      const result = validateReadOnlyQuery(
        'UPDATE users SET name = "John" WHERE id = 1',
      );
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("UPDATE");
    });

    test("should reject DELETE", () => {
      const result = validateReadOnlyQuery("DELETE FROM users WHERE id = 1");
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("DELETE");
    });

    test("should reject DROP TABLE", () => {
      const result = validateReadOnlyQuery("DROP TABLE users");
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("DROP");
    });

    test("should reject CREATE TABLE", () => {
      const result = validateReadOnlyQuery("CREATE TABLE test (id INT)");
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("CREATE");
    });

    test("should reject ALTER TABLE", () => {
      const result = validateReadOnlyQuery(
        "ALTER TABLE users ADD COLUMN age INT",
      );
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("ALTER");
    });

    test("should reject TRUNCATE", () => {
      const result = validateReadOnlyQuery("TRUNCATE TABLE users");
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("TRUNCATE");
    });

    test("should reject GRANT", () => {
      const result = validateReadOnlyQuery("GRANT ALL ON users TO user1");
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("GRANT");
    });

    test("should reject REVOKE", () => {
      const result = validateReadOnlyQuery("REVOKE ALL ON users FROM user1");
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("REVOKE");
    });
  });

  describe("Multiple Statements", () => {
    test("should allow multiple SELECT statements", () => {
      const result = validateReadOnlyQuery(`
        SELECT * FROM users;
        SELECT * FROM orders;
      `);
      expect(result.isValid).toBe(true);
    });

    test("should reject if any statement is a write operation", () => {
      const result = validateReadOnlyQuery(`
        SELECT * FROM users;
        DELETE FROM users WHERE id = 1;
      `);
      expect(result.isValid).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    test("should reject empty query", () => {
      const result = validateReadOnlyQuery("");
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("empty");
    });

    test("should reject whitespace-only query", () => {
      const result = validateReadOnlyQuery("   \n  \t  ");
      expect(result.isValid).toBe(false);
    });

    test("should handle queries with write keywords in comments", () => {
      // Comments should be ignored, so this should pass
      const result = validateReadOnlyQuery(`
        -- DELETE is mentioned in this comment
        /* INSERT is here too */
        SELECT * FROM users
      `);
      expect(result.isValid).toBe(true);
    });

    test("should handle lowercase keywords", () => {
      const result = validateReadOnlyQuery("select * from users");
      expect(result.isValid).toBe(true);
    });

    test("should handle mixed case keywords", () => {
      const result = validateReadOnlyQuery("SeLeCt * FrOm users");
      expect(result.isValid).toBe(true);
    });
  });

  describe("Subqueries", () => {
    test("should allow SELECT with subquery", () => {
      const result = validateReadOnlyQuery(`
        SELECT * FROM users 
        WHERE id IN (SELECT user_id FROM orders WHERE total > 100)
      `);
      expect(result.isValid).toBe(true);
    });

    test("should reject subquery with write operation", () => {
      const result = validateReadOnlyQuery(`
        SELECT * FROM users 
        WHERE id IN (DELETE FROM orders WHERE total > 100)
      `);
      expect(result.isValid).toBe(false);
    });
  });
});
