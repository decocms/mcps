# Vector Databases - Shared Module

Unified vector database module for all MCPs. Provides a consistent interface for working with different vector database providers.

## 🎯 Goal

Centralize all vector database logic in a single place, allowing all MCPs to reuse the same code for operations like semantic search, embeddings storage, and similarity queries.

**✨ The best part:** You can use **any provider** (Pinecone, Qdrant, Weaviate, Milvus, etc.) and switch between them by changing just 1 line of code!

## 📦 Components

### Core Interface

```typescript
interface VectorDatabase {
  upsert(vectors: Vector[], namespace?: string): Promise<UpsertResult>;
  query(params: QueryParams): Promise<QueryResult>;
  fetch(ids: string[], namespace?: string): Promise<FetchResult>;
  delete(params: DeleteParams): Promise<void>;
}
```

### Adapters

1. **PineconeAdapter** - Pinecone vector database

### Future Adapters (Coming Soon)

- **QdrantAdapter** - Qdrant vector database
- **WeaviateAdapter** - Weaviate vector database
- **MilvusAdapter** - Milvus vector database
- **ChromaAdapter** - Chroma vector database
- **PgVectorAdapter** - PostgreSQL with pgvector extension

## 🚀 Basic Usage

### 1. Using Pinecone

```typescript
import { PineconeAdapter } from "@decocms/mcps-shared/vector-databases";

const vectorDB = new PineconeAdapter({
  apiKey: state.apiKey,
  indexHost: state.indexHost,
});

// Upsert vectors
await vectorDB.upsert([
  {
    id: "vec1",
    values: [0.1, 0.2, 0.3, ...],
    metadata: { category: "electronics" }
  }
]);

// Query by similarity
const results = await vectorDB.query({
  vector: [0.1, 0.2, 0.3, ...],
  topK: 10,
  includeMetadata: true
});

console.log(results.matches); // Top 10 similar vectors
```

### 2. Using in MCP Tools

```typescript
import { createTool } from "@decocms/runtime/mastra";
import { PineconeAdapter } from "@decocms/mcps-shared/vector-databases";
import { z } from "zod";
import type { Env } from "../main.ts";

export const createSearchTool = (env: Env) =>
  createTool({
    id: "SEMANTIC_SEARCH",
    description: "Search for similar vectors",
    inputSchema: z.object({
      query: z.array(z.number()).describe("Query vector"),
      topK: z.number().default(10),
    }),
    execute: async (ctx: any) => {
      const { input } = ctx;
      const state = env.DECO_CHAT_REQUEST_CONTEXT.state;

      // Create adapter
      const vectorDB = new PineconeAdapter({
        apiKey: state.apiKey,
        indexHost: state.indexHost,
      });

      // Query
      const results = await vectorDB.query({
        vector: input.query,
        topK: input.topK,
        includeMetadata: true,
      });

      return {
        success: true,
        matches: results.matches,
      };
    },
  });
```

## 📚 Operations

### Upsert (Insert/Update) Vectors

```typescript
const result = await vectorDB.upsert([
  {
    id: "product-123",
    values: [0.1, 0.2, 0.3, ...], // 1536-dim embedding
    metadata: {
      title: "Laptop",
      category: "electronics",
      price: 999
    }
  },
  {
    id: "product-456",
    values: [0.4, 0.5, 0.6, ...],
    metadata: {
      title: "Mouse",
      category: "accessories",
      price: 29
    }
  }
], "products-namespace");

console.log(result.upsertedCount); // 2
```

### Query by Similarity

```typescript
// Query with vector
const results = await vectorDB.query({
  vector: [0.1, 0.2, 0.3, ...], // Query embedding
  topK: 5,
  namespace: "products-namespace",
  filter: { category: "electronics" }, // Metadata filter
  includeMetadata: true,
  includeValues: false
});

results.matches.forEach(match => {
  console.log(`ID: ${match.id}, Score: ${match.score}`);
  console.log(`Metadata:`, match.metadata);
});

// Query with existing vector ID
const results2 = await vectorDB.query({
  id: "product-123", // Use this vector as query
  topK: 5,
  includeMetadata: true
});
```

### Fetch Specific Vectors

```typescript
const result = await vectorDB.fetch(
  ["product-123", "product-456"],
  "products-namespace"
);

console.log(result.vectors["product-123"]); // Full vector data
console.log(result.vectors["product-456"]);
```

### Delete Vectors

```typescript
// Delete specific vectors
await vectorDB.delete({
  ids: ["product-123", "product-456"],
  namespace: "products-namespace"
});

// Delete by metadata filter
await vectorDB.delete({
  filter: { category: "archived" },
  namespace: "products-namespace"
});

// Delete all vectors in namespace
await vectorDB.delete({
  deleteAll: true,
  namespace: "old-products"
});
```

## 🔧 State Configuration

Configure in your MCP's State Schema:

```typescript
import { z } from "zod";
import { StateSchema as BaseStateSchema } from "../shared/deco.gen.ts";

export const StateSchema = BaseStateSchema.extend({
  // Pinecone configuration
  apiKey: z.string().describe("Pinecone API key"),
  indexHost: z.string().describe("Pinecone index host URL"),
  namespace: z.string().optional().describe("Default namespace"),
});
```

## 🎨 Advanced Features

### Sparse Vectors (Hybrid Search)

```typescript
await vectorDB.upsert([{
  id: "doc-1",
  values: [0.1, 0.2, ...], // Dense vector
  sparseValues: {
    indices: [10, 20, 30],
    values: [0.5, 0.8, 0.3]
  },
  metadata: { title: "Document" }
}]);

// Query with hybrid search
const results = await vectorDB.query({
  vector: [0.1, 0.2, ...],
  sparseVector: {
    indices: [10, 20],
    values: [0.6, 0.9]
  },
  topK: 10
});
```

### Metadata Filtering

```typescript
const results = await vectorDB.query({
  vector: queryEmbedding,
  topK: 20,
  filter: {
    category: "electronics",
    price: { $gte: 100, $lte: 1000 },
    inStock: true
  }
});
```

## 📝 Complete MCP Example

```typescript
// pinecone/server/main.ts
import { z } from "zod";
import { withRuntime } from "@decocms/runtime";

export const StateSchema = BaseStateSchema.extend({
  apiKey: z.string().describe("Pinecone API key"),
  indexHost: z.string().describe("Pinecone index host"),
  namespace: z.string().optional().describe("Default namespace"),
});

// pinecone/server/tools/vectors.ts
import { createTool } from "@decocms/runtime/mastra";
import { PineconeAdapter } from "@decocms/mcps-shared/vector-databases";
import { z } from "zod";

export const createUpsertTool = (env: Env) =>
  createTool({
    id: "UPSERT_VECTORS",
    description: "Insert or update vectors",
    inputSchema: z.object({
      vectors: z.array(z.object({
        id: z.string(),
        values: z.array(z.number()),
        metadata: z.record(z.any()).optional()
      })),
      namespace: z.string().optional()
    }),
    execute: async (ctx: any) => {
      const { input } = ctx;
      const state = env.DECO_CHAT_REQUEST_CONTEXT.state;

      const vectorDB = new PineconeAdapter({
        apiKey: state.apiKey,
        indexHost: state.indexHost,
      });

      const result = await vectorDB.upsert(
        input.vectors,
        input.namespace || state.namespace
      );

      return {
        success: true,
        upsertedCount: result.upsertedCount
      };
    },
  });
```

## ✅ Benefits

1. **Single Codebase** - All vector DB logic in one place
2. **Reusability** - All MCPs use the same code
3. **Consistency** - Unified API for all providers
4. **Maintenance** - Fixes benefit all MCPs
5. **Testable** - Easy to mock for testing
6. **Flexible** - Add new providers easily
7. **Provider Agnostic** - Switch providers without changing tool code

## 🔄 Migration from Direct Implementation

**Before:**

```typescript
// Direct Pinecone implementation in MCP
const client = createPineconeClient(env);
const response = await client.upsert({
  vectors: input.vectors,
  namespace: input.namespace,
});
```

**After:**

```typescript
// Using shared abstraction
import { PineconeAdapter } from "@decocms/mcps-shared/vector-databases";

const vectorDB = new PineconeAdapter({
  apiKey: state.apiKey,
  indexHost: state.indexHost,
});
const result = await vectorDB.upsert(input.vectors, input.namespace);
```

## 🧪 Testing

```typescript
import { VectorDatabase } from "@decocms/mcps-shared/vector-databases";

class MockVectorDB implements VectorDatabase {
  async upsert(vectors, namespace) {
    return { upsertedCount: vectors.length };
  }
  
  async query(params) {
    return {
      matches: [
        { id: "test-1", score: 0.95, metadata: {} }
      ]
    };
  }
  
  async fetch(ids, namespace) {
    return { vectors: {} };
  }
  
  async delete(params) {}
}

// Use in tests
const mockDB = new MockVectorDB();
const result = await mockDB.query({ vector: [0.1], topK: 5 });
```

## 📚 Supported Providers

### Current:
- ✅ **Pinecone** - Fully managed vector database

### Coming Soon:
- 🔜 **Qdrant** - Open-source vector search engine
- 🔜 **Weaviate** - Open-source vector database
- 🔜 **Milvus** - Open-source vector database
- 🔜 **Chroma** - Open-source embedding database
- 🔜 **pgvector** - PostgreSQL extension

## 🤝 Contributing

When adding new adapters:

1. Implement `VectorDatabase` interface
2. Add adapter in `adapters/` directory
3. Export from `index.ts`
4. Add tests
5. Document in this README

Example adapter structure:

```typescript
import type { VectorDatabase } from "../interface.ts";

export class MyVectorDBAdapter implements VectorDatabase {
  constructor(config: MyVectorDBConfig) {
    // Initialize client
  }

  async upsert(vectors, namespace) {
    // Implementation
  }

  async query(params) {
    // Implementation
  }

  async fetch(ids, namespace) {
    // Implementation
  }

  async delete(params) {
    // Implementation
  }
}
```

