# farmrio-reorder-collection-db

Private hosted PostgreSQL MCP for Farm Rio collection reorder reports.

## Security model

- Access is authenticated with `MCP_ACCESS_TOKEN` provided in the connection `StateSchema`.
- The expected value is set only in deploy secret `MCP_ACCESS_TOKEN`.
- Database credentials are set only in deploy secret `INTERNAL_DATABASE_URL`.
- No secret is stored in this repository.

## Required deploy secrets

- `MCP_ACCESS_TOKEN`: strong private token to access this MCP.
- `INTERNAL_DATABASE_URL`: managed PostgreSQL connection string.
- `DATABASE_PG_SSL=true` (optional): enable SSL for PostgreSQL connection.

## Local run example

```bash
export MCP_ACCESS_TOKEN="replace-with-a-strong-token"
export INTERNAL_DATABASE_URL="postgresql://user:pass@host:5432/db"
bun run dev
```

## Connection configuration example

```bash
MCP_ACCESS_TOKEN=<same value configured in deploy secret>
```
