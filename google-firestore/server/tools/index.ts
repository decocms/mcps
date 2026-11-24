/**
 * Read-only Firestore tools. Every call runs as the Google account that
 * connected the MCP, so Firestore IAM decides what each person can see.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import {
  buildStructuredQuery,
  collectionPath,
  databaseName,
  decodeValue,
  documentPath,
  documentsRoot,
  FILTER_OPS,
  FIREBASE_API,
  FIRESTORE_API,
  type FirestoreValue,
  googleFetch,
  type RawDocument,
  splitCollectionPath,
  toDocument,
  tokenFrom,
} from "../lib/firestore.ts";

// ---------------------------------------------------------------------------
// Shared input schemas
// ---------------------------------------------------------------------------

const projectId = z
  .string()
  .min(1)
  .describe(
    'Firebase / Google Cloud project id, e.g. "my-app-12345". Find it with firestore_list_projects.',
  );

const databaseId = z
  .string()
  .optional()
  .describe('Firestore database id. Defaults to "(default)".');

const pageToken = z
  .string()
  .optional()
  .describe("nextPageToken from the previous call, to fetch the next page.");

const fieldMask = z
  .array(z.string())
  .optional()
  .describe(
    'Only return these fields (dot paths like "address.city"). Omit to return whole documents.',
  );

function withMask(url: URL, fields?: string[]) {
  for (const f of fields ?? []) url.searchParams.append("mask.fieldPaths", f);
  return url;
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

const listProjectsTool = createPrivateTool({
  id: "firestore_list_projects",
  description:
    "List the Firebase projects the connected Google account can access. Start here when you don't know the project id.",
  inputSchema: z.object({
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    pageToken,
  }),
  execute: async ({ context, runtimeContext }) => {
    const url = new URL(`${FIREBASE_API}/projects`);
    url.searchParams.set("pageSize", String(context.pageSize ?? 50));
    if (context.pageToken) url.searchParams.set("pageToken", context.pageToken);
    const res = await googleFetch<{
      results?: Array<{
        projectId: string;
        displayName?: string;
        projectNumber?: string;
        state?: string;
      }>;
      nextPageToken?: string;
    }>(tokenFrom(runtimeContext), url.toString());
    return {
      projects: (res.results ?? []).map((p) => ({
        projectId: p.projectId,
        displayName: p.displayName,
        projectNumber: p.projectNumber,
        state: p.state,
      })),
      nextPageToken: res.nextPageToken,
    };
  },
});

const listDatabasesTool = createPrivateTool({
  id: "firestore_list_databases",
  description:
    'List the Firestore databases of a project. Most projects only have "(default)".',
  inputSchema: z.object({ projectId }),
  execute: async ({ context, runtimeContext }) => {
    const res = await googleFetch<{
      databases?: Array<{
        name: string;
        locationId?: string;
        type?: string;
        databaseEdition?: string;
        createTime?: string;
      }>;
    }>(
      tokenFrom(runtimeContext),
      `${FIRESTORE_API}/projects/${encodeURIComponent(context.projectId)}/databases`,
    );
    return {
      databases: (res.databases ?? []).map((d) => ({
        databaseId: d.name.split("/").pop(),
        locationId: d.locationId,
        type: d.type,
        edition: d.databaseEdition,
        createTime: d.createTime,
      })),
    };
  },
});

const listCollectionsTool = createPrivateTool({
  id: "firestore_list_collections",
  description:
    "List collection ids at the root of a database, or the subcollections of one document. Use it to discover the data model before reading.",
  inputSchema: z.object({
    projectId,
    databaseId,
    parentDocumentPath: z
      .string()
      .optional()
      .describe(
        'Document whose subcollections to list, e.g. "users/abc". Omit for root collections.',
      ),
    pageSize: z.coerce.number().int().min(1).max(300).optional(),
    pageToken,
  }),
  execute: async ({ context, runtimeContext }) => {
    const parent = documentsRoot(
      context.projectId,
      context.databaseId,
      context.parentDocumentPath,
    );
    const res = await googleFetch<{
      collectionIds?: string[];
      nextPageToken?: string;
    }>(
      tokenFrom(runtimeContext),
      `${FIRESTORE_API}/${parent}:listCollectionIds`,
      {
        body: {
          pageSize: context.pageSize ?? 100,
          ...(context.pageToken ? { pageToken: context.pageToken } : {}),
        },
      },
    );
    return {
      collectionIds: res.collectionIds ?? [],
      nextPageToken: res.nextPageToken,
    };
  },
});

// ---------------------------------------------------------------------------
// Reading documents
// ---------------------------------------------------------------------------

const getDocumentTool = createPrivateTool({
  id: "firestore_get_document",
  description:
    "Read one document by path. Values come back as plain JSON: timestamps as ISO strings, references as document paths.",
  inputSchema: z.object({
    projectId,
    databaseId,
    documentPath: z
      .string()
      .describe('Document path, e.g. "users/abc" or "users/abc/orders/123".'),
    fields: fieldMask,
  }),
  execute: async ({ context, runtimeContext }) => {
    const url = withMask(
      new URL(
        `${FIRESTORE_API}/${documentsRoot(context.projectId, context.databaseId)}/${documentPath(context.documentPath)}`,
      ),
      context.fields,
    );
    const raw = await googleFetch<RawDocument>(
      tokenFrom(runtimeContext),
      url.toString(),
    );
    return toDocument(raw);
  },
});

const listDocumentsTool = createPrivateTool({
  id: "firestore_list_documents",
  description:
    "List the documents of a collection, one page at a time. To filter or sort by a field, use firestore_query instead.",
  inputSchema: z.object({
    projectId,
    databaseId,
    collectionPath: z
      .string()
      .describe('Collection path, e.g. "users" or "users/abc/orders".'),
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(300)
      .optional()
      .describe("Documents per page (default 20)."),
    pageToken,
    orderBy: z
      .string()
      .optional()
      .describe('Order, e.g. "createdAt desc" or "name".'),
    fields: fieldMask,
  }),
  execute: async ({ context, runtimeContext }) => {
    const url = withMask(
      new URL(
        `${FIRESTORE_API}/${documentsRoot(context.projectId, context.databaseId)}/${collectionPath(context.collectionPath)}`,
      ),
      context.fields,
    );
    url.searchParams.set("pageSize", String(context.pageSize ?? 20));
    if (context.pageToken) url.searchParams.set("pageToken", context.pageToken);
    if (context.orderBy) url.searchParams.set("orderBy", context.orderBy);
    const res = await googleFetch<{
      documents?: RawDocument[];
      nextPageToken?: string;
    }>(tokenFrom(runtimeContext), url.toString());
    return {
      documents: (res.documents ?? []).map(toDocument),
      nextPageToken: res.nextPageToken,
    };
  },
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const whereSchema = z.object({
  field: z.string().describe('Field path, e.g. "status" or "address.city".'),
  op: z.enum(FILTER_OPS),
  value: z
    .unknown()
    .optional()
    .describe(
      "Value to compare. Arrays for in / not-in / array-contains-any. Omit for is-null / is-not-null.",
    ),
  valueType: z
    .enum(["timestamp", "reference", "integer", "double"])
    .optional()
    .describe(
      'Set "timestamp" when the field stores a Firestore timestamp (pass an ISO date), "reference" for document references (pass a path). Plain strings never match timestamps.',
    ),
});

const queryShape = {
  projectId,
  databaseId,
  collectionPath: z
    .string()
    .describe(
      'Collection to query, e.g. "orders" or "users/abc/orders". With allDescendants, only the last segment (the collection id) matters under the parent.',
    ),
  allDescendants: z
    .boolean()
    .optional()
    .describe(
      "Collection-group query: match every collection with this id at any depth under the parent.",
    ),
  where: z
    .array(whereSchema)
    .optional()
    .describe("Filters, combined with AND."),
};

const queryTool = createPrivateTool({
  id: "firestore_query",
  description:
    "Query a collection with filters, ordering and a limit. Filters on different fields, or a range filter plus orderBy on another field, may need a composite index; the error message links to create it.",
  inputSchema: z.object({
    ...queryShape,
    orderBy: z
      .array(
        z.object({
          field: z.string(),
          direction: z.enum(["asc", "desc"]).optional(),
        }),
      )
      .optional(),
    select: z
      .array(z.string())
      .optional()
      .describe("Only return these fields."),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe("Maximum documents (default 50)."),
    offset: z.coerce.number().int().min(0).optional(),
  }),
  execute: async ({ context, runtimeContext }) => {
    const database = databaseName(context.projectId, context.databaseId);
    const { parent, collectionId } = splitCollectionPath(
      context.collectionPath,
    );
    const root = documentsRoot(context.projectId, context.databaseId, parent);
    const structuredQuery = buildStructuredQuery(
      {
        collectionId,
        allDescendants: context.allDescendants,
        where: context.where,
        orderBy: context.orderBy,
        select: context.select,
        limit: context.limit ?? 50,
        offset: context.offset,
      },
      database,
    );
    const rows = await googleFetch<
      Array<{ document?: RawDocument; readTime?: string }>
    >(tokenFrom(runtimeContext), `${FIRESTORE_API}/${root}:runQuery`, {
      body: { structuredQuery },
    });
    const documents = rows
      .filter((r) => r.document)
      .map((r) => toDocument(r.document as RawDocument));
    return {
      count: documents.length,
      documents,
      readTime: rows.at(-1)?.readTime,
    };
  },
});

const aggregateTool = createPrivateTool({
  id: "firestore_aggregate",
  description:
    "Count documents, or sum / average a numeric field, over a collection with optional filters, without reading the documents. Use it for 'how many' questions.",
  inputSchema: z.object({
    ...queryShape,
    aggregations: z
      .array(
        z.object({
          type: z.enum(["count", "sum", "avg"]),
          field: z.string().optional().describe("Numeric field for sum / avg."),
          alias: z.string().optional(),
        }),
      )
      .min(1)
      .max(5)
      .optional()
      .describe("Defaults to a single count."),
  }),
  execute: async ({ context, runtimeContext }) => {
    const database = databaseName(context.projectId, context.databaseId);
    const { parent, collectionId } = splitCollectionPath(
      context.collectionPath,
    );
    const root = documentsRoot(context.projectId, context.databaseId, parent);
    const structuredQuery = buildStructuredQuery(
      {
        collectionId,
        allDescendants: context.allDescendants,
        where: context.where,
      },
      database,
    );
    const aggregations = (
      context.aggregations ?? [{ type: "count" as const }]
    ).map((a, i) => {
      const alias =
        a.alias ||
        `${a.type}${a.field ? `_${a.field.replace(/\W/g, "_")}` : ""}_${i}`;
      if (a.type === "count") return { alias, count: {} };
      if (!a.field) throw new Error(`"${a.type}" needs a field.`);
      return { alias, [a.type]: { field: { fieldPath: a.field } } };
    });
    const rows = await googleFetch<
      Array<{
        result?: { aggregateFields?: Record<string, FirestoreValue> };
        readTime?: string;
      }>
    >(
      tokenFrom(runtimeContext),
      `${FIRESTORE_API}/${root}:runAggregationQuery`,
      {
        body: { structuredAggregationQuery: { structuredQuery, aggregations } },
      },
    );
    const fields = rows.find((r) => r.result)?.result?.aggregateFields ?? {};
    const results: Record<string, unknown> = {};
    for (const a of aggregations) {
      const v = fields[a.alias];
      results[a.alias] = v ? decodeValue(v) : null;
    }
    return { results, readTime: rows.at(-1)?.readTime };
  },
});

export const tools = [
  listProjectsTool,
  listDatabasesTool,
  listCollectionsTool,
  getDocumentTool,
  listDocumentsTool,
  queryTool,
  aggregateTool,
];
