const toolsTableIdempotentQuery = `
  CREATE TABLE IF NOT EXISTS tools (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    input_schema TEXT NOT NULL DEFAULT '{}',
    output_schema TEXT NOT NULL DEFAULT '{}',
    execute TEXT NOT NULL DEFAULT '',
    dependencies TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_by TEXT,
    updated_by TEXT
  )
`;

const toolsTableIndexesQuery = `
  CREATE INDEX IF NOT EXISTS idx_tools_created_at ON tools(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_tools_updated_at ON tools(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_tools_name ON tools(name);
`;

export { toolsTableIdempotentQuery, toolsTableIndexesQuery };
