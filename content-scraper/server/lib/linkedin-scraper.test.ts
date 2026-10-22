/**
 * Offline fixture tests for the johnvc LinkedIn posts mapper.
 * No live Apify calls.
 */
import { describe, expect, test } from "bun:test";
import { mapJohnvcPostToRaw } from "./linkedin-scraper.ts";

const FIXTURE_POST: Record<string, unknown> = {
  resultType: "post",
  postId: "7363908644226125825",
  postUrl:
    "https://www.linkedin.com/posts/example_activity-7363908644226125825",
  postType: "post",
  datePosted: "2026-10-01T12:00:00.000Z",
  text: "Weekly MCP digest notes from our team.",
  authorName: "Example Author",
  authorUrl: "https://www.linkedin.com/in/example-author",
  authorHeadline: "Builder at Example Co",
  numLikes: 12,
  numComments: 2,
  images: ["https://example.com/img.png"],
};

const FIXTURE_ERROR: Record<string, unknown> = {
  resultType: "error",
  error: "UnsupportedUrl",
  message: "member-id URL",
};

describe("mapJohnvcPostToRaw", () => {
  test("maps documented fields onto LinkedInRawPost", () => {
    const mapped = mapJohnvcPostToRaw(FIXTURE_POST);
    expect(mapped).not.toBeNull();
    expect(mapped!.id).toBe("7363908644226125825");
    expect(mapped!.linkedinUrl).toContain("activity-7363908644226125825");
    expect(mapped!.content).toContain("Weekly MCP digest");
    expect(mapped!.author.name).toBe("Example Author");
    expect(mapped!.author.linkedinUrl).toBe(
      "https://www.linkedin.com/in/example-author",
    );
    expect(mapped!.author.publicIdentifier).toBe("example-author");
    expect(mapped!.author.info).toBe("Builder at Example Co");
    expect(mapped!.author.avatar).toBeUndefined();
    expect(mapped!.engagement).toEqual({ likes: 12, comments: 2, shares: 0 });
    expect(mapped!.postedAt.date).toBe("2026-10-01T12:00:00.000Z");
    expect(mapped!.postImages).toEqual([
      { url: "https://example.com/img.png" },
    ]);
  });

  test("skips error rows", () => {
    expect(mapJohnvcPostToRaw(FIXTURE_ERROR)).toBeNull();
  });
});
