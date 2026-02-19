// tests/lib/bigquery-client.test.ts
import { test, expect, mock } from "bun:test";
import { BigQueryClient } from "../../server/lib/bigquery-client.ts";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const SCHEMA = { fields: [{ name: "id", type: "STRING" }] };
const ROWS = [{ f: [{ v: "row1" }] }];

// ── tests ─────────────────────────────────────────────────────────────────────

test("queryOnePage: returns rows and pageToken when first response is complete", async () => {
  const fetchMock = mock(() =>
    Promise.resolve(
      makeResponse({
        jobComplete: true,
        jobReference: { jobId: "job123", projectId: "proj" },
        schema: SCHEMA,
        rows: ROWS,
        totalRows: "42",
        totalBytesProcessed: "1000",
        cacheHit: false,
        pageToken: "BQ_TOKEN_ABC",
      }),
    ),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  const client = new BigQueryClient({ accessToken: "tok" });
  const result = await client.queryOnePage("proj", {
    query: "SELECT id FROM t",
    maxResults: 10,
  });

  expect(result.rows).toEqual(ROWS);
  expect(result.schema).toEqual(SCHEMA);
  expect(result.totalRows).toBe("42");
  expect(result.cacheHit).toBe(false);
  expect(result.pageToken).toBe("BQ_TOKEN_ABC");
  expect(result.jobId).toBe("job123");
});

test("queryOnePage: returns without pageToken/jobId when there are no more pages", async () => {
  globalThis.fetch = mock(() =>
    Promise.resolve(
      makeResponse({
        jobComplete: true,
        jobReference: { jobId: "job999", projectId: "proj" },
        schema: SCHEMA,
        rows: ROWS,
        totalRows: "3",
        totalBytesProcessed: "500",
        cacheHit: true,
        // no pageToken field
      }),
    ),
  ) as unknown as typeof fetch;

  const client = new BigQueryClient({ accessToken: "tok" });
  const result = await client.queryOnePage("proj", { query: "SELECT 1" });

  expect(result.pageToken).toBeUndefined();
  expect(result.jobId).toBeUndefined();
  expect(result.cacheHit).toBe(true);
});

test("queryOnePage: polls getQueryResults when job is not immediately complete", async () => {
  let callCount = 0;
  globalThis.fetch = mock((_url: string | URL) => {
    callCount++;
    if (callCount === 1) {
      // Initial query() — job not complete yet
      return Promise.resolve(
        makeResponse({
          jobComplete: false,
          jobReference: { jobId: "jobPoll", projectId: "proj" },
        }),
      );
    }
    // getQueryResults() poll — now complete
    return Promise.resolve(
      makeResponse({
        jobComplete: true,
        jobReference: { jobId: "jobPoll", projectId: "proj" },
        schema: SCHEMA,
        rows: ROWS,
        totalRows: "1",
        totalBytesProcessed: "200",
        cacheHit: false,
      }),
    );
  }) as unknown as typeof fetch;

  const client = new BigQueryClient({ accessToken: "tok" });
  const result = await client.queryOnePage("proj", { query: "SELECT 1" });

  expect(callCount).toBe(2);
  expect(result.rows).toEqual(ROWS);
});

test("queryOnePage: throws when query returns errors", async () => {
  globalThis.fetch = mock(() =>
    Promise.resolve(
      makeResponse({
        jobComplete: true,
        errors: [{ message: "Table not found" }],
      }),
    ),
  ) as unknown as typeof fetch;

  const client = new BigQueryClient({ accessToken: "tok" });
  await expect(
    client.queryOnePage("proj", { query: "SELECT * FROM missing" }),
  ).rejects.toThrow("Query error: Table not found");
});
