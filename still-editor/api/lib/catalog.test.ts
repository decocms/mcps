import { describe, expect, it } from "bun:test";
import { productIdFromLink } from "./catalog.ts";

describe("productIdFromLink", () => {
  it("reads the id at the end of a product link", () => {
    expect(
      productIdFromLink(
        "https://www.example.com/produto/top-vitoria-zebra-154267",
      ),
    ).toBe(154267);
    expect(
      productIdFromLink(
        "https://www.example.com/produto/top-vitoria-154267/?utm=x#mix-match",
      ),
    ).toBe(154267);
    expect(productIdFromLink(" 154267 ")).toBe(154267);
  });

  it("rejects links without an id", () => {
    expect(
      productIdFromLink("https://www.example.com/colecao/biquinis"),
    ).toBeNull();
    expect(productIdFromLink("not a link")).toBeNull();
  });
});
