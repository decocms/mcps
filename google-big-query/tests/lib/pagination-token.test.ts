// tests/lib/pagination-token.test.ts
import { test, expect } from "bun:test";
import {
  encodePageToken,
  decodePageToken,
} from "../../server/lib/pagination-token.ts";

test("round-trip: encode then decode returns original values", () => {
  const jobId = "my-project:US.bqjob_r123";
  const apiToken = "SOME_BQ_PAGE_TOKEN_VALUE==";
  const opaque = encodePageToken(jobId, apiToken);
  const { jobId: gotJobId, apiToken: gotApiToken } = decodePageToken(opaque);
  expect(gotJobId).toBe(jobId);
  expect(gotApiToken).toBe(apiToken);
});

test("encodePageToken produces a string with no newlines", () => {
  const opaque = encodePageToken("job1", "tok1");
  expect(opaque).not.toContain("\n");
});

test("decodePageToken throws on invalid token", () => {
  expect(() => decodePageToken("bm9uZXdsaW5l")).toThrow("Invalid pageToken");
});
