import { describe, expect, test } from "bun:test";
import {
  buildStructuredQuery,
  collectionPath,
  databaseName,
  decodeFields,
  documentPath,
  documentsRoot,
  encodeValue,
  explainError,
  splitCollectionPath,
  toDocument,
} from "./firestore.ts";

const DB = "projects/p/databases/(default)";

describe("paths", () => {
  test("database defaults to (default)", () => {
    expect(databaseName("p")).toBe(DB);
    expect(databaseName("p", "analytics")).toBe(
      "projects/p/databases/analytics",
    );
  });

  test("documents root with and without a parent document", () => {
    expect(documentsRoot("p")).toBe(`${DB}/documents`);
    expect(documentsRoot("p", undefined, "/users/abc/")).toBe(
      `${DB}/documents/users/abc`,
    );
    expect(() => documentsRoot("p", undefined, "users")).toThrow(
      "not a document path",
    );
  });

  test("collection and document paths check the segment count", () => {
    expect(collectionPath("users/abc/orders")).toBe("users/abc/orders");
    expect(() => collectionPath("users/abc")).toThrow("not a collection path");
    expect(documentPath("users/abc")).toBe("users/abc");
    expect(() => documentPath("users")).toThrow("not a document path");
  });

  test("segments are URL-encoded", () => {
    expect(documentPath("users/a b#1")).toBe("users/a%20b%231");
  });

  test("splitCollectionPath separates the parent document", () => {
    expect(splitCollectionPath("orders")).toEqual({
      parent: undefined,
      collectionId: "orders",
    });
    expect(splitCollectionPath("users/abc/orders")).toEqual({
      parent: "users/abc",
      collectionId: "orders",
    });
  });
});

describe("decode", () => {
  test("flattens every Firestore value type", () => {
    expect(
      decodeFields({
        n: { nullValue: null },
        b: { booleanValue: true },
        i: { integerValue: "42" },
        big: { integerValue: "9223372036854775807" },
        d: { doubleValue: 1.5 },
        nan: { doubleValue: "NaN" },
        t: { timestampValue: "2026-11-23T18:00:00Z" },
        s: { stringValue: "hi" },
        r: {
          referenceValue: "projects/p/databases/(default)/documents/users/abc",
        },
        g: { geoPointValue: { latitude: -22.9, longitude: -43.2 } },
        a: {
          arrayValue: { values: [{ integerValue: "1" }, { stringValue: "x" }] },
        },
        emptyArray: { arrayValue: {} },
        m: { mapValue: { fields: { city: { stringValue: "Rio" } } } },
        emptyMap: { mapValue: {} },
      }),
    ).toEqual({
      n: null,
      b: true,
      i: 42,
      big: "9223372036854775807",
      d: 1.5,
      nan: "NaN",
      t: "2026-11-23T18:00:00Z",
      s: "hi",
      r: "users/abc",
      g: { latitude: -22.9, longitude: -43.2 },
      a: [1, "x"],
      emptyArray: [],
      m: { city: "Rio" },
      emptyMap: {},
    });
  });

  test("toDocument gives id, relative path and data", () => {
    expect(
      toDocument({
        name: "projects/p/databases/(default)/documents/users/abc/orders/o1",
        fields: { total: { doubleValue: 99.9 } },
        updateTime: "2026-11-23T00:00:00Z",
      }),
    ).toEqual({
      id: "o1",
      path: "users/abc/orders/o1",
      createTime: undefined,
      updateTime: "2026-11-23T00:00:00Z",
      data: { total: 99.9 },
    });
  });
});

describe("encode", () => {
  test("plain JSON", () => {
    expect(encodeValue(3)).toEqual({ integerValue: "3" });
    expect(encodeValue(3.5)).toEqual({ doubleValue: 3.5 });
    expect(encodeValue("x")).toEqual({ stringValue: "x" });
    expect(encodeValue(null)).toEqual({ nullValue: null });
    expect(encodeValue({ a: [true] })).toEqual({
      mapValue: {
        fields: { a: { arrayValue: { values: [{ booleanValue: true }] } } },
      },
    });
  });

  test("hints for timestamps, references and numbers", () => {
    expect(encodeValue("2026-11-01", "timestamp")).toEqual({
      timestampValue: "2026-11-01T00:00:00.000Z",
    });
    expect(() => encodeValue("not a date", "timestamp")).toThrow();
    expect(encodeValue("users/abc", "reference", DB)).toEqual({
      referenceValue: `${DB}/documents/users/abc`,
    });
    expect(encodeValue(2, "double")).toEqual({ doubleValue: 2 });
    expect(encodeValue("7", "integer")).toEqual({ integerValue: "7" });
  });
});

describe("buildStructuredQuery", () => {
  test("single filter, order, select and limit", () => {
    expect(
      buildStructuredQuery(
        {
          collectionId: "orders",
          where: [{ field: "status", op: "==", value: "paid" }],
          orderBy: [{ field: "createdAt", direction: "desc" }],
          select: ["total"],
          limit: 10,
        },
        DB,
      ),
    ).toEqual({
      from: [{ collectionId: "orders" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "status" },
          op: "EQUAL",
          value: { stringValue: "paid" },
        },
      },
      orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
      select: { fields: [{ fieldPath: "total" }] },
      limit: 10,
    });
  });

  test("several filters become an AND composite; unary and list ops", () => {
    const q = buildStructuredQuery(
      {
        collectionId: "orders",
        allDescendants: true,
        where: [
          {
            field: "createdAt",
            op: ">=",
            value: "2026-11-01",
            valueType: "timestamp",
          },
          { field: "status", op: "in", value: ["paid", "shipped"] },
          { field: "coupon", op: "is-null" },
        ],
      },
      DB,
    );
    expect(q.from).toEqual([{ collectionId: "orders", allDescendants: true }]);
    expect(q.where).toEqual({
      compositeFilter: {
        op: "AND",
        filters: [
          {
            fieldFilter: {
              field: { fieldPath: "createdAt" },
              op: "GREATER_THAN_OR_EQUAL",
              value: { timestampValue: "2026-11-01T00:00:00.000Z" },
            },
          },
          {
            fieldFilter: {
              field: { fieldPath: "status" },
              op: "IN",
              value: {
                arrayValue: {
                  values: [{ stringValue: "paid" }, { stringValue: "shipped" }],
                },
              },
            },
          },
          { unaryFilter: { op: "IS_NULL", field: { fieldPath: "coupon" } } },
        ],
      },
    });
  });

  test("list operators need an array", () => {
    expect(() =>
      buildStructuredQuery(
        { collectionId: "c", where: [{ field: "x", op: "in", value: "a" }] },
        DB,
      ),
    ).toThrow("needs an array");
  });
});

describe("explainError", () => {
  test("permission denied suggests the IAM role", () => {
    const msg = explainError(
      403,
      JSON.stringify({
        error: {
          code: 403,
          status: "PERMISSION_DENIED",
          message: "Missing or insufficient permissions.",
        },
      }),
    );
    expect(msg).toContain("PERMISSION_DENIED");
    expect(msg).toContain("roles/datastore.viewer");
  });

  test("disabled API is called out", () => {
    const msg = explainError(
      403,
      JSON.stringify({
        error: {
          status: "PERMISSION_DENIED",
          message: "Cloud Firestore API has not been used in project",
          details: [{ reason: "SERVICE_DISABLED" }],
        },
      }),
    );
    expect(msg).toContain("API is disabled");
  });
});
