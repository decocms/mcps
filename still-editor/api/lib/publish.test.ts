import { describe, expect, it } from "bun:test";
import { belongsToProduct } from "./publish.ts";

describe("belongsToProduct", () => {
  it("accepts a variant whose images are in the product's folder", () => {
    const urls = [
      "https://cdn.example.com/img/p/top-vitoria-154267/1.jpg",
      null,
    ];
    expect(belongsToProduct(urls, 154267)).toBe(true);
    expect(belongsToProduct([], 154267)).toBe(true);
  });

  it("refuses a variant holding another product's images", () => {
    const urls = [
      "https://cdn.example.com/img/p/top-vitoria-154267/1.jpg",
      "https://cdn.example.com/img/p/calcinha-tai-1542670/1.jpg",
    ];
    expect(belongsToProduct(urls, 154267)).toBe(false);
  });
});
