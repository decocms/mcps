import { describe, expect, it } from "bun:test";
import { colorKey, productIdFromLink } from "./catalog.ts";

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

describe("colorKey", () => {
  it("matches a Cor typed in any case, accent or padding", () => {
    expect(colorKey("MOSTARDA      ")).toBe(colorKey("mostarda"));
    expect(colorKey("Verde  Oliva")).toBe(colorKey("VERDE OLIVA"));
    expect(colorKey("Marrom Braúna")).toBe(colorKey("MARROM BRAUNA"));
    expect(colorKey("MOSTARDA")).not.toBe(colorKey("MARROM"));
  });
});
