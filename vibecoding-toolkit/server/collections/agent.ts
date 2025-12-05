const agentTableIdempotentQuery = `
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT,
    updated_by TEXT
  )
`;

const agentTableIndexesQuery = `
  CREATE INDEX IF NOT EXISTS idx_agents_created_at ON agents(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_agents_updated_at ON agents(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_agents_title ON agents(title);
`;

export { agentTableIdempotentQuery, agentTableIndexesQuery };
