# Readonly SQL MCP

A Model Context Protocol (MCP) server that provides secure, read-only SQL query execution against configured databases. This MCP ensures data safety by validating all queries to prevent any write operations.

## Features

- ✅ **Read-Only Validation**: All SQL queries are validated to ensure they only perform read operations
- ✅ **Multiple Database Support**: Extensible architecture supporting PostgreSQL (currently), with MySQL and SQLite planned
- ✅ **Parameterized Queries**: Support for secure parameterized queries to prevent SQL injection
- ✅ **Connection Pooling**: Efficient connection management with automatic cleanup
- ✅ **Result Limiting**: Configurable result set limits to prevent accidentally returning too much data
- ✅ **Comprehensive Validation**: Blocks write operations (INSERT, UPDATE, DELETE, etc.), schema modifications (CREATE, ALTER, DROP), and dangerous patterns

## Installation

### Prerequisites

- Node.js >= 22.0.0
- Bun package manager
- A PostgreSQL database (currently supported)

### Setup

1. Install dependencies:
```bash
bun install
```

2. Configure the database connection in your MCP state:
   - `databaseType`: Currently "postgres" (mysql and sqlite coming soon)
   - `connectionString`: Your database connection string

## Configuration

When installing this MCP, you'll need to provide:

### Database Type
Choose from:
- `postgres` - PostgreSQL database (currently supported)
- `mysql` - MySQL database (planned)
- `sqlite` - SQLite database (planned)

### Connection String
Format depends on your database type:

**PostgreSQL:**
```
postgresql://username:password@hostname:port/database
postgresql://username:password@hostname:port/database?sslmode=require
```

Examples:
- Local: `postgresql://myuser:mypassword@localhost:5432/mydb`
- Remote: `postgresql://user:pass@db.example.com:5432/production?sslmode=require`
- Supabase: `postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`
- Neon: `postgresql://[user]:[password]@[endpoint].neon.tech/[dbname]?sslmode=require`

## Available Tools

### `QUERY_SQL`

Execute a read-only SQL query against the configured database.

**Input:**
- `query` (string, required): The SQL query to execute. Must be read-only (SELECT, SHOW, DESCRIBE, EXPLAIN, etc.)
- `params` (array, optional): Parameters for parameterized queries (use $1, $2, etc. for PostgreSQL)
- `limit` (number, optional, default: 1000): Maximum number of rows to return

**Output:**
- `rows` (array): Array of result rows, each row is an object with column names as keys
- `totalRowCount` (number): Total number of rows that matched the query
- `returnedCount` (number): Number of rows actually returned (after applying limit)
- `fields` (array): Metadata about columns (name, data type)
- `truncated` (boolean): Whether results were truncated due to limit

**Example Usage:**

```typescript
// Simple query
const result = await QUERY_SQL({
  query: "SELECT * FROM users WHERE active = true"
});

// Parameterized query (PostgreSQL)
const result = await QUERY_SQL({
  query: "SELECT * FROM users WHERE email = $1",
  params: ["user@example.com"]
});

// Query with custom limit
const result = await QUERY_SQL({
  query: "SELECT * FROM large_table",
  limit: 100
});

// Complex query with JOINs
const result = await QUERY_SQL({
  query: `
    SELECT u.name, COUNT(o.id) as order_count
    FROM users u
    LEFT JOIN orders o ON u.id = o.user_id
    WHERE u.created_at > $1
    GROUP BY u.id, u.name
    ORDER BY order_count DESC
  `,
  params: ["2024-01-01"]
});
```

## Security Features

### Query Validation

All queries are validated before execution to ensure they are read-only. The following are blocked:

**Write Operations:**
- `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `MERGE`, `UPSERT`

**Schema Modifications:**
- `CREATE`, `ALTER`, `DROP`, `RENAME`

**Transaction Control:**
- `COMMIT`, `ROLLBACK`, `SAVEPOINT`

**Permission Changes:**
- `GRANT`, `REVOKE`

**Dangerous Operations:**
- `EXEC`, `EXECUTE`, `CALL`
- File operations (`INTO OUTFILE`, `LOAD_FILE`)
- System commands

**Example of blocked queries:**

```sql
-- ❌ These will be rejected:
INSERT INTO users (name) VALUES ('hacker');
UPDATE users SET admin = true WHERE id = 1;
DELETE FROM users WHERE id = 1;
DROP TABLE users;
CREATE TABLE malicious (id INT);
```

```sql
-- ✅ These are allowed:
SELECT * FROM users;
SELECT COUNT(*) FROM orders WHERE status = 'pending';
SELECT u.*, o.total FROM users u JOIN orders o ON u.id = o.user_id;
WITH monthly_sales AS (
  SELECT DATE_TRUNC('month', created_at) as month, SUM(total) as sales
  FROM orders GROUP BY month
) SELECT * FROM monthly_sales;
```

## Development

### Running locally

```bash
bun run dev
```

### Type checking

```bash
bun run check
```

### Building for deployment

```bash
bun run build
```

### Deploying

```bash
bun run deploy
```

## Architecture

The MCP is structured for extensibility:

```
server/
├── lib/
│   ├── clients/          # Database-specific implementations
│   │   └── postgres.ts   # PostgreSQL client
│   ├── db-client.ts      # Database client interface
│   └── sql-validator.ts  # Query validation logic
├── tools/
│   ├── sql.ts           # SQL query tool
│   └── index.ts         # Tool exports
└── main.ts              # MCP entry point
```

### Adding New Database Support

To add support for a new database type:

1. Create a new client in `server/lib/clients/[database].ts` implementing the `DatabaseClient` interface
2. Add the database type to the enum in `server/main.ts` StateSchema
3. Update the factory function in `server/lib/db-client.ts` to handle the new type

Example for MySQL:

```typescript
// server/lib/clients/mysql.ts
import type { DatabaseClient, QueryResult } from '../db-client.ts';
import mysql from 'mysql2/promise';

export class MySQLClient implements DatabaseClient {
  private connection: mysql.Connection;

  constructor(connectionString: string) {
    // Initialize MySQL connection
  }

  async query(sql: string, params: any[] = []): Promise<QueryResult> {
    // Execute query
  }

  async testConnection(): Promise<boolean> {
    // Test connection
  }

  async close(): Promise<void> {
    // Close connection
  }
}
```

## Limitations

- Currently only PostgreSQL is supported (MySQL and SQLite coming soon)
- Connection pooling is handled per-query (connections are opened and closed for each request)
- Maximum result set size is configurable but defaults to 1000 rows
- Query validation is based on keyword detection and may not catch all edge cases

## Troubleshooting

### Connection Issues

If you're having trouble connecting to your database:

1. **Check connection string format**: Ensure it follows the correct format for your database type
2. **Verify credentials**: Test with a database client like `psql` or TablePlus
3. **Check firewall rules**: Ensure your database allows connections from the MCP server
4. **SSL/TLS requirements**: Some providers require SSL (add `?sslmode=require` for PostgreSQL)

### Query Validation Errors

If a legitimate read-only query is being rejected:

1. Check for write keywords in comments (remove them)
2. Verify you're not using stored procedures that might perform writes
3. Avoid CTEs or subqueries that contain write operations

## License

MIT

## Support

For issues, questions, or contributions, please visit the [GitHub repository](https://github.com/deco-cx/apps).

