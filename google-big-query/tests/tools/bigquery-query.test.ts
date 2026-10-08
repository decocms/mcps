// tests/tools/bigquery-query.test.ts
import { test, expect, mock } from "bun:test";
import {
  encodePageToken,
  decodePageToken,
} from "../../server/lib/pagination-token.ts";

// ── Test the encode/decode used by the tool ──────────────────────────────────
// (Belt-and-suspenders: also tested in pagination-token.test.ts)

test("nextPageToken encodes jobId and apiToken, decodes back", () => {
  const jobId = "proj:US.bqjob_abc";
  const apiToken = "CONTINUATION==";
  const encoded = encodePageToken(jobId, apiToken);
  const { jobId: j, apiToken: a } = decodePageToken(encoded);
  expect(j).toBe(jobId);
  expect(a).toBe(apiToken);
});

// ── Test the tool behaviour indirectly via fetch mocking ─────────────────────

function makeResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const SCHEMA = { fields: [{ name: "name", type: "STRING" }] };
const ROWS = [{ f: [{ v: "Alice" }] }];

test("first call: returns nextPageToken when BigQuery has more pages", async () => {
  // Stub fetch to return a BigQuery response with pageToken
  globalThis.fetch = mock(() =>
    Promise.resolve(
      makeResponse({
        jobComplete: true,
        jobReference: { jobId: "jobXYZ", projectId: "myproject" },
        schema: SCHEMA,
        rows: ROWS,
        totalRows: "500",
        totalBytesProcessed: "4096",
        cacheHit: false,
        pageToken: "BQ_PAGE2",
      }),
    ),
  ) as unknown as typeof fetch;

  // Import tool factory lazily so the fetch mock is already in place
  const { createQueryTool } = await import("../../server/tools/bigquery.ts");
  const tool = createQueryTool({
    MESH_REQUEST_CONTEXT: { authorization: "Bearer fake" },
  } as never);

  // @ts-ignore — access internal execute for testing
  const result = await tool.execute({
    context: { projectId: "myproject", query: "SELECT name FROM t" },
    runtimeContext: {} as never,
  });

  expect(result.nextPageToken).toBeDefined();
  // Verify we can decode it
  const { jobId, apiToken } = decodePageToken(result.nextPageToken!);
  expect(jobId).toBe("jobXYZ");
  expect(apiToken).toBe("BQ_PAGE2");
  expect(result.rows).toEqual([{ name: "Alice" }]);
  expect(result.totalRows).toBe("500");
});

test("first call: no nextPageToken when result fits in one page", async () => {
  globalThis.fetch = mock(() =>
    Promise.resolve(
      makeResponse({
        jobComplete: true,
        jobReference: { jobId: "jobSingle", projectId: "myproject" },
        schema: SCHEMA,
        rows: ROWS,
        totalRows: "1",
        totalBytesProcessed: "100",
        cacheHit: false,
        // no pageToken
      }),
    ),
  ) as unknown as typeof fetch;

  const { createQueryTool } = await import("../../server/tools/bigquery.ts");
  const tool = createQueryTool({
    MESH_REQUEST_CONTEXT: { authorization: "Bearer fake" },
  } as never);

  // @ts-ignore
  const result = await tool.execute({
    context: { projectId: "myproject", query: "SELECT 1" },
    runtimeContext: {} as never,
  });

  expect(result.nextPageToken).toBeUndefined();
});

test("subsequent call: pageToken triggers getQueryResults with correct jobId", async () => {
  let capturedUrl = "";
  globalThis.fetch = mock((url: string | URL) => {
    capturedUrl = url.toString();
    return Promise.resolve(
      makeResponse({
        jobComplete: true,
        jobReference: { jobId: "jobPage2", projectId: "myproject" },
        schema: SCHEMA,
        rows: ROWS,
        totalRows: "500",
        totalBytesProcessed: "0",
        cacheHit: true,
        // no more pages
      }),
    );
  }) as unknown as typeof fetch;

  const { createQueryTool } = await import("../../server/tools/bigquery.ts");
  const tool = createQueryTool({
    MESH_REQUEST_CONTEXT: { authorization: "Bearer fake" },
  } as never);

  const opaqueToken = encodePageToken("jobPage2", "BQ_PAGE2_TOKEN");

  // @ts-ignore
  const result = await tool.execute({
    context: { projectId: "myproject", pageToken: opaqueToken },
    runtimeContext: {} as never,
  });

  // Should have called getQueryResults (GET /queries/{jobId}) not POST /queries
  expect(capturedUrl).toContain("/queries/jobPage2");
  expect(capturedUrl).toContain("pageToken=BQ_PAGE2_TOKEN");
  expect(result.nextPageToken).toBeUndefined(); // last page
  expect(result.cacheHit).toBe(true);
});

test("throws when neither query nor pageToken is provided", async () => {
  const { createQueryTool } = await import("../../server/tools/bigquery.ts");
  const tool = createQueryTool({
    MESH_REQUEST_CONTEXT: { authorization: "Bearer fake" },
  } as never);

  // @ts-ignore
  await expect(
    tool.execute({
      context: { projectId: "myproject" },
      runtimeContext: {} as never,
    }),
  ).rejects.toThrow("query is required when pageToken is not provided");
});

// ── Job location (non-US/EU datasets) ────────────────────────────────────────
// BigQuery answers 404 "Not found: Job" to getQueryResults for a job in e.g.
// southamerica-east1 unless `location` is passed — page 2+ broke for every
// non-US dataset while page 1 (returned inline by jobs.query) worked.

test("first call: nextPageToken carries the job location", async () => {
  globalThis.fetch = mock(() =>
    Promise.resolve(
      makeResponse({
        jobComplete: true,
        jobReference: {
          jobId: "jobSA",
          projectId: "myproject",
          location: "southamerica-east1",
        },
        schema: SCHEMA,
        rows: ROWS,
        totalRows: "500",
        totalBytesProcessed: "4096",
        cacheHit: false,
        pageToken: "BQ_PAGE2",
      }),
    ),
  ) as unknown as typeof fetch;

  const { createQueryTool } = await import("../../server/tools/bigquery.ts");
  const tool = createQueryTool({
    MESH_REQUEST_CONTEXT: { authorization: "Bearer fake" },
  } as never);

  // @ts-ignore
  const result = await tool.execute({
    context: { projectId: "myproject", query: "SELECT name FROM t" },
    runtimeContext: {} as never,
  });

  expect(decodePageToken(result.nextPageToken!)).toEqual({
    jobId: "jobSA",
    apiToken: "BQ_PAGE2",
    location: "southamerica-east1",
  });
});

test("subsequent call: getQueryResults is sent the job location", async () => {
  let capturedUrl = "";
  globalThis.fetch = mock((url: string | URL) => {
    capturedUrl = url.toString();
    return Promise.resolve(
      makeResponse({
        jobComplete: true,
        jobReference: {
          jobId: "jobSA",
          projectId: "myproject",
          location: "southamerica-east1",
        },
        schema: SCHEMA,
        rows: ROWS,
        totalRows: "500",
        totalBytesProcessed: "0",
        cacheHit: false,
        pageToken: "BQ_PAGE3",
      }),
    );
  }) as unknown as typeof fetch;

  const { createQueryTool } = await import("../../server/tools/bigquery.ts");
  const tool = createQueryTool({
    MESH_REQUEST_CONTEXT: { authorization: "Bearer fake" },
  } as never);

  // @ts-ignore
  const result = await tool.execute({
    context: {
      projectId: "myproject",
      pageToken: encodePageToken("jobSA", "BQ_PAGE2", "southamerica-east1"),
    },
    runtimeContext: {} as never,
  });

  expect(capturedUrl).toContain("/queries/jobSA");
  expect(capturedUrl).toContain("location=southamerica-east1");
  // The location keeps travelling to page 3.
  expect(decodePageToken(result.nextPageToken!).location).toBe(
    "southamerica-east1",
  );
});

test("tokens issued before the location was encoded still decode", () => {
  const legacy = btoa("jobOld\nOLD_TOKEN");
  expect(decodePageToken(legacy)).toEqual({
    jobId: "jobOld",
    apiToken: "OLD_TOKEN",
  });
});
