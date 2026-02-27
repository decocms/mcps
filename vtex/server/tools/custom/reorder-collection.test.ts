import { describe, expect, test } from "bun:test";
import { buildCollectionImportXml } from "./reorder-collection.ts";

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
