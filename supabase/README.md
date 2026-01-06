# Supabase MCP

Generic Supabase database operations MCP. Designed to be used as a binding for data persistence in other MCPs.

## Overview

This MCP provides a standardized interface for common database operations with Supabase:

| Tool | Description |
|------|-------------|
| `db_select` | Query records with filtering, ordering, and pagination |
| `db_insert` | Insert one or multiple records |
| `db_update` | Update records matching filter conditions |
| `db_delete` | Delete records matching filter conditions |
| `db_upsert` | Insert or update based on conflict resolution |
| `db_rpc` | Call PostgreSQL functions (stored procedures) |

## Configuration

When installing this MCP, you'll need to provide:

| Field | Description | Example |
|-------|-------------|---------|
| `supabaseUrl` | Your Supabase project URL | `https://xxxxx.supabase.co` |
| `supabaseKey` | API key (service role or anon) | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |

> **Note**: Use the **service role key** for full database access, or **anon key** for restricted access based on Row Level Security (RLS) policies.

## Usage Examples

### Select records

```typescript
// Simple select
await env.SUPABASE.db_select({
  table: "users",
  columns: ["id", "name", "email"],
  limit: 10
});

// With filters and ordering
await env.SUPABASE.db_select({
  table: "orders",
  columns: ["id", "total", "created_at"],
  filters: [
    { column: "status", operator: "eq", value: "pending" },
    { column: "total", operator: "gte", value: 100 }
  ],
  orderBy: [{ column: "created_at", ascending: false }],
  limit: 20
});
```

### Insert records

```typescript
// Single record
await env.SUPABASE.db_insert({
  table: "users",
  data: { name: "John", email: "john@example.com" },
  returning: true
});

// Multiple records
await env.SUPABASE.db_insert({
  table: "products",
  data: [
    { name: "Product A", price: 29.99 },
    { name: "Product B", price: 49.99 }
  ]
});
```

### Update records

```typescript
await env.SUPABASE.db_update({
  table: "users",
  data: { verified: true },
  filters: [{ column: "id", operator: "eq", value: "user_123" }],
  returning: true
});
```

### Delete records

```typescript
await env.SUPABASE.db_delete({
  table: "sessions",
  filters: [
    { column: "expires_at", operator: "lt", value: new Date().toISOString() }
  ]
});
```

### Upsert (Insert or Update)

```typescript
await env.SUPABASE.db_upsert({
  table: "blog_content",
  data: {
    url: "https://example.com/post-1",
    title: "My Post",
    content: "...",
    fingerprint: "abc123"
  },
  onConflict: "url",
  returning: true
});
```

### Call RPC function

```typescript
await env.SUPABASE.db_rpc({
  functionName: "increment_counter",
  params: { row_id: "123", amount: 1 }
});
```

## Filter Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equal | `{ column: "status", operator: "eq", value: "active" }` |
| `neq` | Not equal | `{ column: "status", operator: "neq", value: "deleted" }` |
| `gt` | Greater than | `{ column: "age", operator: "gt", value: 18 }` |
| `gte` | Greater than or equal | `{ column: "price", operator: "gte", value: 100 }` |
| `lt` | Less than | `{ column: "quantity", operator: "lt", value: 10 }` |
| `lte` | Less than or equal | `{ column: "score", operator: "lte", value: 50 }` |
| `like` | Pattern match (case sensitive) | `{ column: "name", operator: "like", value: "%john%" }` |
| `ilike` | Pattern match (case insensitive) | `{ column: "email", operator: "ilike", value: "%@gmail.com" }` |
| `in` | In array | `{ column: "status", operator: "in", value: ["active", "pending"] }` |
| `is` | Is null/true/false | `{ column: "deleted_at", operator: "is", value: null }` |

## Response Format

All tools return a consistent response format:

```typescript
interface DbResponse {
  success: boolean;   // Whether the operation succeeded
  data?: any[];       // The result data (if applicable)
  error?: string;     // Error message (if failed)
  count?: number;     // Number of affected/returned rows
}
```

## Security Considerations

- **Service Role Key**: Has full access to all tables, bypasses RLS. Use with caution.
- **Anon Key**: Respects RLS policies. Recommended for user-facing operations.
- Filters are required for `update` and `delete` operations to prevent accidental mass modifications.

## Development

```bash
# Install dependencies
bun install

# Run in development mode
bun run dev

# Type check
bun run check

# Build for production
bun run build

# Publish to registry
bun run publish
```

## Pricing

This MCP is **free to use**. You only pay for your Supabase database usage directly to Supabase based on their pricing plans.
