const toolsTableIdempotentQuery = `
  CREATE TABLE IF NOT EXISTS tools (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    input_schema JSONB NOT NULL DEFAULT '{}',
    output_schema JSONB NOT NULL DEFAULT '{}',
    execute TEXT NOT NULL DEFAULT '',
    dependencies JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
