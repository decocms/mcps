/**
 * Cloud Firestore REST v1 (https://firebase.google.com/docs/firestore/reference/rest)
 * plus the Firebase Management API for project discovery.
 *
 * Firestore returns typed values ({ stringValue }, { integerValue: "42" }, …).
 * Tools hand agents plain JSON instead, so `decodeValue` flattens them and
 * `encodeValue` builds them back for query filters.
 */

export const FIRESTORE_API = "https://firestore.googleapis.com/v1";
export const FIREBASE_API = "https://firebase.googleapis.com/v1beta1";
export const DEFAULT_DATABASE = "(default)";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** Google access token from the connection's OAuth, without the scheme. */
export function tokenFrom(runtimeContext: unknown): string {
  const env = (
    runtimeContext as {
      env?: { MESH_REQUEST_CONTEXT?: { authorization?: string | null } };
    }
  )?.env;
  const token = env?.MESH_REQUEST_CONTEXT?.authorization
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) {
    throw new Error(
      "Missing Google authorization. Connect this MCP with a Google account that can read the Firebase project.",
    );
  }
  return token;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

interface GoogleError {
  error?: {
    code?: number;
    status?: string;
    message?: string;
    details?: Array<{ reason?: string }>;
  };
}

/** Turns a Google API error body into a message an agent can act on. */
export function explainError(status: number, body: string): string {
  let parsed: GoogleError = {};
  try {
    parsed = JSON.parse(body) as GoogleError;
  } catch {
    // Not JSON: fall through with the raw text.
  }
  const err = parsed.error;
  const message = err?.message ?? body.slice(0, 500);
  const reasons = (err?.details ?? []).map((d) => d.reason).filter(Boolean);

  let hint = "";
  if (reasons.includes("SERVICE_DISABLED")) {
    hint =
      " The API is disabled in this project: enable it in the Google Cloud console (APIs & Services).";
  } else if (status === 403) {
    hint =
      " The connected Google account needs IAM access to this project, e.g. roles/datastore.viewer (Cloud Datastore Viewer) for reads.";
  } else if (status === 404) {
    hint =
      ' Check the project id, the database id (default is "(default)") and the path.';
  } else if (
    status === 400 &&
    /index/i.test(message) &&
    /create/i.test(message)
  ) {
    hint =
      " This query needs a composite index; the message above links to create it.";
  }
  return `Firestore API error ${status}${err?.status ? ` ${err.status}` : ""}: ${message}${hint}`;
}

export async function googleFetch<T>(
  token: string,
  url: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) {
    throw new Error(explainError(res.status, await res.text()));
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function segments(path: string): string[] {
  return path
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter((s) => s.length > 0);
}

export function databaseName(projectId: string, databaseId?: string): string {
  const project = projectId.trim();
  if (!project) throw new Error("projectId is required.");
  return `projects/${encodeURIComponent(project)}/databases/${encodeURIComponent(
    databaseId?.trim() || DEFAULT_DATABASE,
  )}`;
}

/** `projects/p/databases/d/documents`, optionally under a parent document. */
export function documentsRoot(
  projectId: string,
  databaseId?: string,
  parentDocumentPath?: string,
): string {
  const root = `${databaseName(projectId, databaseId)}/documents`;
  if (!parentDocumentPath?.trim()) return root;
  const parts = segments(parentDocumentPath);
  if (parts.length % 2 !== 0) {
    throw new Error(
      `"${parentDocumentPath}" is not a document path: it needs an even number of segments, like "users/abc".`,
    );
  }
  return `${root}/${parts.map(encodeURIComponent).join("/")}`;
}

/** Validates "col", "col/doc/sub" style paths (odd segment count). */
export function collectionPath(path: string): string {
  const parts = segments(path);
  if (parts.length === 0 || parts.length % 2 !== 1) {
    throw new Error(
      `"${path}" is not a collection path: it needs an odd number of segments, like "users" or "users/abc/orders".`,
    );
  }
  return parts.map(encodeURIComponent).join("/");
}

/** Validates "col/doc", "col/doc/sub/doc" style paths (even segment count). */
export function documentPath(path: string): string {
  const parts = segments(path);
  if (parts.length === 0 || parts.length % 2 !== 0) {
    throw new Error(
      `"${path}" is not a document path: it needs an even number of segments, like "users/abc".`,
    );
  }
  return parts.map(encodeURIComponent).join("/");
}

/** Splits "users/abc/orders" into parent "users/abc" and collection "orders". */
export function splitCollectionPath(path: string): {
  parent?: string;
  collectionId: string;
} {
  collectionPath(path);
  const parts = segments(path);
  const collectionId = parts.pop() as string;
  return {
    parent: parts.length ? parts.join("/") : undefined,
    collectionId,
  };
}

/** "projects/p/databases/d/documents/users/abc" -> "users/abc". */
export function relativePath(name: string): string {
  const marker = "/documents/";
  const i = name.indexOf(marker);
  return i === -1 ? name : name.slice(i + marker.length);
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

export type FirestoreValue = {
  nullValue?: null | "NULL_VALUE";
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number | string;
  timestampValue?: string;
  stringValue?: string;
  bytesValue?: string;
  referenceValue?: string;
  geoPointValue?: { latitude?: number; longitude?: number };
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
};

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

export function decodeValue(value: FirestoreValue): Json {
  if ("nullValue" in value) return null;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.integerValue !== undefined) {
    const n = Number(value.integerValue);
    // Keep 64-bit integers that don't fit a double as strings, losslessly.
    return Number.isSafeInteger(n) ? n : value.integerValue;
  }
  // NaN / Infinity come back as the strings "NaN" / "Infinity"; keep them.
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.timestampValue !== undefined) return value.timestampValue;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.bytesValue !== undefined) return value.bytesValue;
  if (value.referenceValue !== undefined) {
    return relativePath(value.referenceValue);
  }
  if (value.geoPointValue !== undefined) {
    return {
      latitude: value.geoPointValue.latitude ?? 0,
      longitude: value.geoPointValue.longitude ?? 0,
    };
  }
  if (value.arrayValue !== undefined) {
    return (value.arrayValue.values ?? []).map(decodeValue);
  }
  if (value.mapValue !== undefined) {
    return decodeFields(value.mapValue.fields);
  }
  return null;
}

export function decodeFields(
  fields: Record<string, FirestoreValue> | undefined,
): { [key: string]: Json } {
  const out: { [key: string]: Json } = {};
  for (const [k, v] of Object.entries(fields ?? {})) out[k] = decodeValue(v);
  return out;
}

export type ValueHint = "timestamp" | "reference" | "integer" | "double";

/**
 * JSON -> Firestore value. Plain JSON is ambiguous for timestamps and
 * references (both look like strings), so filters pass a hint for those.
 */
export function encodeValue(
  value: unknown,
  hint?: ValueHint,
  database?: string,
): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };

  if (hint === "timestamp") {
    const date = new Date(value as string | number);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`"${String(value)}" is not a valid timestamp.`);
    }
    return { timestampValue: date.toISOString() };
  }
  if (hint === "reference") {
    if (!database) throw new Error("A reference value needs the database.");
    return {
      referenceValue: `${database}/documents/${documentPath(String(value))}`,
    };
  }
  if (hint === "integer")
    return { integerValue: String(Math.trunc(Number(value))) };
  if (hint === "double") return { doubleValue: Number(value) };

  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((v) => encodeValue(v)) } };
  }
  if (typeof value === "object") {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      fields[k] = encodeValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export interface RawDocument {
  name: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
}

export interface Document {
  id: string;
  path: string;
  createTime?: string;
  updateTime?: string;
  data: { [key: string]: Json };
}

export function toDocument(raw: RawDocument): Document {
  const path = relativePath(raw.name);
  return {
    id: path.split("/").pop() ?? path,
    path,
    createTime: raw.createTime,
    updateTime: raw.updateTime,
    data: decodeFields(raw.fields),
  };
}

// ---------------------------------------------------------------------------
// Structured queries
// ---------------------------------------------------------------------------

export const FILTER_OPS = [
  "==",
  "!=",
  "<",
  "<=",
  ">",
  ">=",
  "array-contains",
  "array-contains-any",
  "in",
  "not-in",
  "is-null",
  "is-not-null",
  "is-nan",
  "is-not-nan",
] as const;

export type FilterOp = (typeof FILTER_OPS)[number];

const FIELD_OPS: Record<string, string> = {
  "==": "EQUAL",
  "!=": "NOT_EQUAL",
  "<": "LESS_THAN",
  "<=": "LESS_THAN_OR_EQUAL",
  ">": "GREATER_THAN",
  ">=": "GREATER_THAN_OR_EQUAL",
  "array-contains": "ARRAY_CONTAINS",
  "array-contains-any": "ARRAY_CONTAINS_ANY",
  in: "IN",
  "not-in": "NOT_IN",
};

const UNARY_OPS: Record<string, string> = {
  "is-null": "IS_NULL",
  "is-not-null": "IS_NOT_NULL",
  "is-nan": "IS_NAN",
  "is-not-nan": "IS_NOT_NAN",
};

export interface WhereClause {
  field: string;
  op: FilterOp;
  value?: unknown;
  valueType?: ValueHint;
}

export interface OrderClause {
  field: string;
  direction?: "asc" | "desc";
}

export interface QueryInput {
  collectionId: string;
  allDescendants?: boolean;
  where?: WhereClause[];
  orderBy?: OrderClause[];
  select?: string[];
  limit?: number;
  offset?: number;
}

function buildFilter(w: WhereClause, database: string) {
  const field = { fieldPath: w.field };
  const unary = UNARY_OPS[w.op];
  if (unary) return { unaryFilter: { op: unary, field } };

  const op = FIELD_OPS[w.op];
  if (!op) throw new Error(`Unsupported operator "${w.op}".`);
  const listOp =
    w.op === "in" || w.op === "not-in" || w.op === "array-contains-any";
  if (listOp && !Array.isArray(w.value)) {
    throw new Error(`Operator "${w.op}" needs an array value.`);
  }
  const value = listOp
    ? {
        arrayValue: {
          values: (w.value as unknown[]).map((v) =>
            encodeValue(v, w.valueType, database),
          ),
        },
      }
    : encodeValue(w.value, w.valueType, database);
  return { fieldFilter: { field, op, value } };
}

export function buildStructuredQuery(q: QueryInput, database: string) {
  const query: Record<string, unknown> = {
    from: [
      {
        collectionId: q.collectionId,
        ...(q.allDescendants ? { allDescendants: true } : {}),
      },
    ],
  };
  const filters = (q.where ?? []).map((w) => buildFilter(w, database));
  if (filters.length === 1) query.where = filters[0];
  if (filters.length > 1) {
    query.where = { compositeFilter: { op: "AND", filters } };
  }
  if (q.orderBy?.length) {
    query.orderBy = q.orderBy.map((o) => ({
      field: { fieldPath: o.field },
      direction: o.direction === "desc" ? "DESCENDING" : "ASCENDING",
    }));
  }
  if (q.select?.length) {
    query.select = { fields: q.select.map((fieldPath) => ({ fieldPath })) };
  }
  if (q.limit !== undefined) query.limit = q.limit;
  if (q.offset) query.offset = q.offset;
  return query;
}
