import { describe, expect, test } from "bun:test";
import {
  buildCollectionImportCsv,
  buildCollectionImportXlsLikeContent,
  buildCollectionImportXml,
  normalizeSkuIdsInput,
} from "./reorder-collection.ts";

describe("buildCollectionImportXml", () => {
  test("builds XML with each skuId entry", () => {
    const xml = buildCollectionImportXml([101, 202, 303]);

    expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(xml).toContain("<ArrayOfCollectionItemDTO>");
    expect(xml).toContain("<SkuId>101</SkuId>");
    expect(xml).toContain("<SkuId>202</SkuId>");
    expect(xml).toContain("<SkuId>303</SkuId>");
    expect(xml).toContain("</ArrayOfCollectionItemDTO>");
  });

  test("builds empty root for empty list", () => {
    const xml = buildCollectionImportXml([]);

    expect(xml).toBe(
      '<?xml version="1.0" encoding="utf-8"?><ArrayOfCollectionItemDTO></ArrayOfCollectionItemDTO>',
    );
  });
});

describe("buildCollectionImportCsv", () => {
  test("builds csv with VTEX collection spreadsheet headers", () => {
    const csv = buildCollectionImportCsv([101, 202, 303]);
    expect(csv).toBe(
      "SKU,PRODUCT,SKUREFID,PRODUCTREFID\n101,,,\n202,,,\n303,,,",
    );
  });

  test("builds csv with only header for empty list", () => {
    const csv = buildCollectionImportCsv([]);
    expect(csv).toBe("SKU,PRODUCT,SKUREFID,PRODUCTREFID\n");
  });
});

describe("buildCollectionImportXlsLikeContent", () => {
  test("builds tab-separated content with VTEX spreadsheet headers", () => {
    const xlsLike = buildCollectionImportXlsLikeContent([101, 202, 303]);
    expect(xlsLike).toBe(
      "SKU\tPRODUCT\tSKUREFID\tPRODUCTREFID\n101\t\t\t\n202\t\t\t\n303\t\t\t",
    );
  });

  test("builds xls-like content with only header for empty list", () => {
    const xlsLike = buildCollectionImportXlsLikeContent([]);
    expect(xlsLike).toBe("SKU\tPRODUCT\tSKUREFID\tPRODUCTREFID\n");
  });
});

describe("normalizeSkuIdsInput", () => {
  test("parses comma-separated sku IDs", () => {
    const parsed = normalizeSkuIdsInput("8,4,14,1,10,11,7,18");
    expect(parsed).toEqual(["8", "4", "14", "1", "10", "11", "7", "18"]);
  });

  test("parses JSON array string", () => {
    const parsed = normalizeSkuIdsInput("[8, 4, 14]");
    expect(parsed).toEqual([8, 4, 14]);
  });

  test("returns empty list for blank string", () => {
    const parsed = normalizeSkuIdsInput("   ");
    expect(parsed).toEqual([]);
  });

  test("returns undefined for object payload from empty UI field", () => {
    const parsed = normalizeSkuIdsInput({});
    expect(parsed).toBeUndefined();
  });
});
