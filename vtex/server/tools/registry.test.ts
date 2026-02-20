import { describe, test, expect, mock } from "bun:test";
import { createToolFromOperation } from "../lib/tool-adapter.ts";

// ── Zod schemas ────────────────────────────────────────────────────────────────
import * as catalogZod from "../generated/catalog/zod.gen.ts";
import * as logisticsZod from "../generated/logistics/zod.gen.ts";
import * as pricingZod from "../generated/pricing/zod.gen.ts";
import * as ordersZod from "../generated/orders/zod.gen.ts";

// ── Mock environment ───────────────────────────────────────────────────────────
const mockEnv = {
  MESH_REQUEST_CONTEXT: {
    state: {
      accountName: "test-store",
      appKey: "vtexappkey-xxx",
      appToken: "vtexapptoken-xxx",
    },
  },
} as any;

// The @decocms/runtime createTool wraps execute and calls createRuntimeContext(input.runtimeContext).
// When runtimeContext is provided as the `prev` argument and AsyncLocalStorage has no store,
// createRuntimeContext returns prev directly. We must pass runtimeContext in every execute call.
const mockRuntimeContext = {
  env: mockEnv,
  ctx: { waitUntil: (_p: Promise<unknown>) => {} },
} as any;

// ──────────────────────────────────────────────────────────────────────────────
// Brand
// ──────────────────────────────────────────────────────────────────────────────

describe("VTEX_GET_BRAND", () => {
  test("happy path: returns brand data and calls sdkFn with correct path param", async () => {
    const fixture = { Id: 1, Name: "Test Brand", IsActive: true };
    const sdkFn = mock(() => Promise.resolve({ data: fixture }));

    const tool = createToolFromOperation({
      id: "VTEX_GET_BRAND",
      description: "Get brand details by ID.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zGetApiCatalogPvtBrandByBrandIdData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    const result = await tool.execute({
      runtimeContext: mockRuntimeContext,
      context: { brandId: "1" },
    });

    expect(result).toEqual(fixture);
    expect(sdkFn).toHaveBeenCalledTimes(1);
    expect(sdkFn).toHaveBeenCalledWith(
      expect.objectContaining({ path: { brandId: "1" } }),
    );
  });

  test("error path: throws when sdkFn returns error", async () => {
    const sdkFn = mock(() =>
      Promise.resolve({ error: { status: 404, message: "Not Found" } }),
    );

    const tool = createToolFromOperation({
      id: "VTEX_GET_BRAND",
      description: "Get brand details by ID.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zGetApiCatalogPvtBrandByBrandIdData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    await expect(
      tool.execute({
        runtimeContext: mockRuntimeContext,
        context: { brandId: "999" },
      }),
    ).rejects.toThrow();
  });
});

describe("VTEX_LIST_BRANDS", () => {
  test("happy path: returns brands list and calls sdkFn once", async () => {
    const fixture = [
      { Id: 1, Name: "Brand A" },
      { Id: 2, Name: "Brand B" },
    ];
    const sdkFn = mock(() => Promise.resolve({ data: fixture }));

    const tool = createToolFromOperation({
      id: "VTEX_LIST_BRANDS",
      description: "List all brands.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zBrandListData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    const result = await tool.execute({
      runtimeContext: mockRuntimeContext,
      context: {},
    });

    expect(result).toEqual(fixture);
    expect(sdkFn).toHaveBeenCalledTimes(1);
  });

  test("error path: throws when sdkFn returns error", async () => {
    const sdkFn = mock(() =>
      Promise.resolve({
        error: { status: 500, message: "Internal Server Error" },
      }),
    );

    const tool = createToolFromOperation({
      id: "VTEX_LIST_BRANDS",
      description: "List all brands.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zBrandListData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    await expect(
      tool.execute({ runtimeContext: mockRuntimeContext, context: {} }),
    ).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Category
// ──────────────────────────────────────────────────────────────────────────────

describe("VTEX_GET_CATEGORY", () => {
  test("happy path: returns category data and calls sdkFn with correct path param", async () => {
    const fixture = { Id: 10, Name: "Electronics", FatherCategoryId: null };
    const sdkFn = mock(() => Promise.resolve({ data: fixture }));

    const tool = createToolFromOperation({
      id: "VTEX_GET_CATEGORY",
      description: "Get category details by ID.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zGetApiCatalogPvtCategoryByCategoryIdData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    const result = await tool.execute({
      runtimeContext: mockRuntimeContext,
      context: { categoryId: 10 },
    });

    expect(result).toEqual(fixture);
    expect(sdkFn).toHaveBeenCalledTimes(1);
    expect(sdkFn).toHaveBeenCalledWith(
      expect.objectContaining({ path: { categoryId: 10 } }),
    );
  });

  test("error path: throws when sdkFn returns error", async () => {
    const sdkFn = mock(() =>
      Promise.resolve({ error: { status: 404, message: "Not Found" } }),
    );

    const tool = createToolFromOperation({
      id: "VTEX_GET_CATEGORY",
      description: "Get category details by ID.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zGetApiCatalogPvtCategoryByCategoryIdData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    await expect(
      tool.execute({
        runtimeContext: mockRuntimeContext,
        context: { categoryId: 9999 },
      }),
    ).rejects.toThrow();
  });
});

describe("VTEX_LIST_CATEGORIES", () => {
  test("happy path: returns category tree and calls sdkFn with correct path param", async () => {
    const fixture = [{ id: 1, name: "Root", children: [] }];
    const sdkFn = mock(() => Promise.resolve({ data: fixture }));

    const tool = createToolFromOperation({
      id: "VTEX_LIST_CATEGORIES",
      description: "List the full category tree.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zCategoryTreeData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    const result = await tool.execute({
      runtimeContext: mockRuntimeContext,
      context: { categoryLevels: "3" },
    });

    expect(result).toEqual(fixture);
    expect(sdkFn).toHaveBeenCalledTimes(1);
    expect(sdkFn).toHaveBeenCalledWith(
      expect.objectContaining({ path: { categoryLevels: "3" } }),
    );
  });

  test("error path: throws when sdkFn returns error", async () => {
    const sdkFn = mock(() =>
      Promise.resolve({
        error: { status: 500, message: "Internal Server Error" },
      }),
    );

    const tool = createToolFromOperation({
      id: "VTEX_LIST_CATEGORIES",
      description: "List the full category tree.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zCategoryTreeData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    await expect(
      tool.execute({
        runtimeContext: mockRuntimeContext,
        context: { categoryLevels: "3" },
      }),
    ).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Warehouse
// ──────────────────────────────────────────────────────────────────────────────

describe("VTEX_GET_WAREHOUSE", () => {
  test("happy path: returns warehouse data and calls sdkFn with correct path param", async () => {
    const fixture = { id: "wh-001", name: "Main Warehouse" };
    const sdkFn = mock(() => Promise.resolve({ data: fixture }));

    const tool = createToolFromOperation({
      id: "VTEX_GET_WAREHOUSE",
      description: "Get warehouse details by ID.",
      annotations: { readOnlyHint: true },
      requestSchema: logisticsZod.zWarehouseByIdData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    const result = await tool.execute({
      runtimeContext: mockRuntimeContext,
      context: { warehouseId: "wh-001" },
    });

    expect(result).toEqual(fixture);
    expect(sdkFn).toHaveBeenCalledTimes(1);
    expect(sdkFn).toHaveBeenCalledWith(
      expect.objectContaining({ path: { warehouseId: "wh-001" } }),
    );
  });

  test("error path: throws when sdkFn returns error", async () => {
    const sdkFn = mock(() =>
      Promise.resolve({ error: { status: 404, message: "Not Found" } }),
    );

    const tool = createToolFromOperation({
      id: "VTEX_GET_WAREHOUSE",
      description: "Get warehouse details by ID.",
      annotations: { readOnlyHint: true },
      requestSchema: logisticsZod.zWarehouseByIdData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    await expect(
      tool.execute({
        runtimeContext: mockRuntimeContext,
        context: { warehouseId: "does-not-exist" },
      }),
    ).rejects.toThrow();
  });
});

describe("VTEX_LIST_WAREHOUSES", () => {
  test("happy path: returns warehouse list and calls sdkFn once", async () => {
    const fixture = [{ id: "wh-001", name: "Main Warehouse" }];
    const sdkFn = mock(() => Promise.resolve({ data: fixture }));

    const tool = createToolFromOperation({
      id: "VTEX_LIST_WAREHOUSES",
      description: "List all warehouses.",
      annotations: { readOnlyHint: true },
      requestSchema: logisticsZod.zAllWarehousesData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    const result = await tool.execute({
      runtimeContext: mockRuntimeContext,
      context: {},
    });

    expect(result).toEqual(fixture);
    expect(sdkFn).toHaveBeenCalledTimes(1);
  });

  test("error path: throws when sdkFn returns error", async () => {
    const sdkFn = mock(() =>
      Promise.resolve({
        error: { status: 500, message: "Internal Server Error" },
      }),
    );

    const tool = createToolFromOperation({
      id: "VTEX_LIST_WAREHOUSES",
      description: "List all warehouses.",
      annotations: { readOnlyHint: true },
      requestSchema: logisticsZod.zAllWarehousesData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    await expect(
      tool.execute({ runtimeContext: mockRuntimeContext, context: {} }),
    ).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Inventory
// ──────────────────────────────────────────────────────────────────────────────

describe("VTEX_GET_INVENTORY", () => {
  test("happy path: returns inventory data and calls sdkFn with correct path param", async () => {
    const fixture = {
      skuId: "42",
      balance: [{ warehouseId: "wh-001", totalQuantity: 100 }],
    };
    const sdkFn = mock(() => Promise.resolve({ data: fixture }));

    const tool = createToolFromOperation({
      id: "VTEX_GET_INVENTORY",
      description: "Get inventory balance for a SKU.",
      annotations: { readOnlyHint: true },
      requestSchema: logisticsZod.zInventoryBySkuData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    const result = await tool.execute({
      runtimeContext: mockRuntimeContext,
      context: { skuId: "42" },
    });

    expect(result).toEqual(fixture);
    expect(sdkFn).toHaveBeenCalledTimes(1);
    expect(sdkFn).toHaveBeenCalledWith(
      expect.objectContaining({ path: { skuId: "42" } }),
    );
  });

  test("error path: throws when sdkFn returns error", async () => {
    const sdkFn = mock(() =>
      Promise.resolve({ error: { status: 404, message: "Not Found" } }),
    );

    const tool = createToolFromOperation({
      id: "VTEX_GET_INVENTORY",
      description: "Get inventory balance for a SKU.",
      annotations: { readOnlyHint: true },
      requestSchema: logisticsZod.zInventoryBySkuData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    await expect(
      tool.execute({
        runtimeContext: mockRuntimeContext,
        context: { skuId: "9999" },
      }),
    ).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Pricing
// ──────────────────────────────────────────────────────────────────────────────

describe("VTEX_GET_PRICE", () => {
  test("happy path: returns price data and calls sdkFn with correct path param", async () => {
    const fixture = { itemId: 42, basePrice: 29.99 };
    const sdkFn = mock(() => Promise.resolve({ data: fixture }));

    const tool = createToolFromOperation({
      id: "VTEX_GET_PRICE",
      description: "Get the base price for a SKU.",
      annotations: { readOnlyHint: true },
      requestSchema: pricingZod.zGetPriceData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    const result = await tool.execute({
      runtimeContext: mockRuntimeContext,
      context: { itemId: 42 },
    });

    expect(result).toEqual(fixture);
    expect(sdkFn).toHaveBeenCalledTimes(1);
    expect(sdkFn).toHaveBeenCalledWith(
      expect.objectContaining({ path: { itemId: 42 } }),
    );
  });

  test("error path: throws when sdkFn returns error", async () => {
    const sdkFn = mock(() =>
      Promise.resolve({ error: { status: 404, message: "Not Found" } }),
    );

    const tool = createToolFromOperation({
      id: "VTEX_GET_PRICE",
      description: "Get the base price for a SKU.",
      annotations: { readOnlyHint: true },
      requestSchema: pricingZod.zGetPriceData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    await expect(
      tool.execute({
        runtimeContext: mockRuntimeContext,
        context: { itemId: 9999 },
      }),
    ).rejects.toThrow();
  });
});

describe("VTEX_GET_COMPUTED_PRICE", () => {
  test("happy path: returns computed price and calls sdkFn with correct params", async () => {
    const fixture = { itemId: 42, priceTableId: "gold", computedPrice: 24.99 };
    const sdkFn = mock(() => Promise.resolve({ data: fixture }));

    const tool = createToolFromOperation({
      id: "VTEX_GET_COMPUTED_PRICE",
      description: "Get the computed price for a SKU.",
      annotations: { readOnlyHint: true },
      requestSchema: pricingZod.zGetComputedPricebypricetableData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    const result = await tool.execute({
      runtimeContext: mockRuntimeContext,
      context: {
        itemId: 42,
        priceTableId: "gold",
        categoryIds: 10,
        brandId: 1,
        quantity: 5,
      },
    });

    expect(result).toEqual(fixture);
    expect(sdkFn).toHaveBeenCalledTimes(1);
    expect(sdkFn).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { itemId: 42, priceTableId: "gold" },
        query: { categoryIds: 10, brandId: 1, quantity: 5 },
      }),
    );
  });

  test("error path: throws when sdkFn returns error", async () => {
    const sdkFn = mock(() =>
      Promise.resolve({ error: { status: 404, message: "Not Found" } }),
    );

    const tool = createToolFromOperation({
      id: "VTEX_GET_COMPUTED_PRICE",
      description: "Get the computed price for a SKU.",
      annotations: { readOnlyHint: true },
      requestSchema: pricingZod.zGetComputedPricebypricetableData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    await expect(
      tool.execute({
        runtimeContext: mockRuntimeContext,
        context: {
          itemId: 9999,
          priceTableId: "gold",
          categoryIds: 10,
          brandId: 1,
          quantity: 1,
        },
      }),
    ).rejects.toThrow();
  });
});

describe("VTEX_GET_FIXED_PRICES", () => {
  test("happy path: returns fixed prices and calls sdkFn with correct path param", async () => {
    const fixture = [{ tradePolicyId: "1", value: 19.99 }];
    const sdkFn = mock(() => Promise.resolve({ data: fixture }));

    const tool = createToolFromOperation({
      id: "VTEX_GET_FIXED_PRICES",
      description: "Get fixed prices for a SKU.",
      annotations: { readOnlyHint: true },
      requestSchema: pricingZod.zGetFixedPricesData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    const result = await tool.execute({
      runtimeContext: mockRuntimeContext,
      context: { itemId: 42 },
    });

    expect(result).toEqual(fixture);
    expect(sdkFn).toHaveBeenCalledTimes(1);
    expect(sdkFn).toHaveBeenCalledWith(
      expect.objectContaining({ path: { itemId: 42 } }),
    );
  });

  test("error path: throws when sdkFn returns error", async () => {
    const sdkFn = mock(() =>
      Promise.resolve({ error: { status: 404, message: "Not Found" } }),
    );

    const tool = createToolFromOperation({
      id: "VTEX_GET_FIXED_PRICES",
      description: "Get fixed prices for a SKU.",
      annotations: { readOnlyHint: true },
      requestSchema: pricingZod.zGetFixedPricesData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    await expect(
      tool.execute({
        runtimeContext: mockRuntimeContext,
        context: { itemId: 9999 },
      }),
    ).rejects.toThrow();
  });
});

describe("VTEX_LIST_PRICE_TABLES", () => {
  test("happy path: returns price tables and calls sdkFn once", async () => {
    const fixture = ["gold", "silver", "default"];
    const sdkFn = mock(() => Promise.resolve({ data: fixture }));

    const tool = createToolFromOperation({
      id: "VTEX_LIST_PRICE_TABLES",
      description: "List all price tables.",
      annotations: { readOnlyHint: true },
      requestSchema: pricingZod.zListpricetablesData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    const result = await tool.execute({
      runtimeContext: mockRuntimeContext,
      context: {},
    });

    expect(result).toEqual(fixture);
    expect(sdkFn).toHaveBeenCalledTimes(1);
  });

  test("error path: throws when sdkFn returns error", async () => {
    const sdkFn = mock(() =>
      Promise.resolve({
        error: { status: 500, message: "Internal Server Error" },
      }),
    );

    const tool = createToolFromOperation({
      id: "VTEX_LIST_PRICE_TABLES",
      description: "List all price tables.",
      annotations: { readOnlyHint: true },
      requestSchema: pricingZod.zListpricetablesData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    await expect(
      tool.execute({ runtimeContext: mockRuntimeContext, context: {} }),
    ).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Product
// ──────────────────────────────────────────────────────────────────────────────

describe("VTEX_GET_PRODUCT", () => {
  test("happy path: returns product data and calls sdkFn with correct path param", async () => {
    const fixture = { Id: 100, Name: "Test Product", IsActive: true };
    const sdkFn = mock(() => Promise.resolve({ data: fixture }));

    const tool = createToolFromOperation({
      id: "VTEX_GET_PRODUCT",
      description: "Get a product by its ID.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zGetProductbyidData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    const result = await tool.execute({
      runtimeContext: mockRuntimeContext,
      context: { productId: "100" },
    });

    expect(result).toEqual(fixture);
    expect(sdkFn).toHaveBeenCalledTimes(1);
    expect(sdkFn).toHaveBeenCalledWith(
      expect.objectContaining({ path: { productId: "100" } }),
    );
  });

  test("error path: throws when sdkFn returns error", async () => {
    const sdkFn = mock(() =>
      Promise.resolve({ error: { status: 404, message: "Not Found" } }),
    );

    const tool = createToolFromOperation({
      id: "VTEX_GET_PRODUCT",
      description: "Get a product by its ID.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zGetProductbyidData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    await expect(
      tool.execute({
        runtimeContext: mockRuntimeContext,
        context: { productId: "9999" },
      }),
    ).rejects.toThrow();
  });
});

describe("VTEX_LIST_PRODUCTS", () => {
  test("happy path: returns product/SKU IDs and calls sdkFn once", async () => {
    const fixture = { data: { 100: [1001, 1002], 101: [1003] } };
    const sdkFn = mock(() => Promise.resolve({ data: fixture }));

    const tool = createToolFromOperation({
      id: "VTEX_LIST_PRODUCTS",
      description: "List product and SKU IDs.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zProductAndSkuIdsData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    const result = await tool.execute({
      runtimeContext: mockRuntimeContext,
      context: { _from: 1, _to: 50 },
    });

    expect(result).toEqual(fixture);
    expect(sdkFn).toHaveBeenCalledTimes(1);
    expect(sdkFn).toHaveBeenCalledWith(
      expect.objectContaining({ query: { _from: 1, _to: 50 } }),
    );
  });

  test("error path: throws when sdkFn returns error", async () => {
    const sdkFn = mock(() =>
      Promise.resolve({
        error: { status: 500, message: "Internal Server Error" },
      }),
    );

    const tool = createToolFromOperation({
      id: "VTEX_LIST_PRODUCTS",
      description: "List product and SKU IDs.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zProductAndSkuIdsData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    await expect(
      tool.execute({ runtimeContext: mockRuntimeContext, context: {} }),
    ).rejects.toThrow();
  });
});

describe("VTEX_GET_PRODUCT_SPECIFICATIONS", () => {
  test("happy path: returns specifications and calls sdkFn with correct path param", async () => {
    const fixture = [{ FieldId: 1, FieldName: "Color", Value: ["Red"] }];
    const sdkFn = mock(() => Promise.resolve({ data: fixture }));

    const tool = createToolFromOperation({
      id: "VTEX_GET_PRODUCT_SPECIFICATIONS",
      description: "Get all specifications for a product.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zGetProductSpecificationbyProductIdData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    const result = await tool.execute({
      runtimeContext: mockRuntimeContext,
      context: { productId: 100 },
    });

    expect(result).toEqual(fixture);
    expect(sdkFn).toHaveBeenCalledTimes(1);
    expect(sdkFn).toHaveBeenCalledWith(
      expect.objectContaining({ path: { productId: 100 } }),
    );
  });

  test("error path: throws when sdkFn returns error", async () => {
    const sdkFn = mock(() =>
      Promise.resolve({ error: { status: 404, message: "Not Found" } }),
    );

    const tool = createToolFromOperation({
      id: "VTEX_GET_PRODUCT_SPECIFICATIONS",
      description: "Get all specifications for a product.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zGetProductSpecificationbyProductIdData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    await expect(
      tool.execute({
        runtimeContext: mockRuntimeContext,
        context: { productId: 9999 },
      }),
    ).rejects.toThrow();
  });
});

describe("VTEX_GET_PRODUCT_BY_REF_ID", () => {
  test("happy path: returns product data and calls sdkFn with correct path param", async () => {
    const fixture = { Id: 100, Name: "Test Product", RefId: "REF-001" };
    const sdkFn = mock(() => Promise.resolve({ data: fixture }));

    const tool = createToolFromOperation({
      id: "VTEX_GET_PRODUCT_BY_REF_ID",
      description: "Get a product by its external reference ID.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zProductbyRefIdData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    const result = await tool.execute({
      runtimeContext: mockRuntimeContext,
      context: { refId: "REF-001" },
    });

    expect(result).toEqual(fixture);
    expect(sdkFn).toHaveBeenCalledTimes(1);
    expect(sdkFn).toHaveBeenCalledWith(
      expect.objectContaining({ path: { refId: "REF-001" } }),
    );
  });

  test("error path: throws when sdkFn returns error", async () => {
    const sdkFn = mock(() =>
      Promise.resolve({ error: { status: 404, message: "Not Found" } }),
    );

    const tool = createToolFromOperation({
      id: "VTEX_GET_PRODUCT_BY_REF_ID",
      description: "Get a product by its external reference ID.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zProductbyRefIdData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    await expect(
      tool.execute({
        runtimeContext: mockRuntimeContext,
        context: { refId: "DOES-NOT-EXIST" },
      }),
    ).rejects.toThrow();
  });
});

describe("VTEX_GET_PRODUCT_VARIATIONS", () => {
  test("happy path: returns product variations and calls sdkFn with correct path param", async () => {
    const fixture = { productId: 100, skus: [{ sku: 1001 }, { sku: 1002 }] };
    const sdkFn = mock(() => Promise.resolve({ data: fixture }));

    const tool = createToolFromOperation({
      id: "VTEX_GET_PRODUCT_VARIATIONS",
      description: "Get all SKU variations for a product.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zProductVariationsData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    const result = await tool.execute({
      runtimeContext: mockRuntimeContext,
      context: { productId: 100 },
    });

    expect(result).toEqual(fixture);
    expect(sdkFn).toHaveBeenCalledTimes(1);
    expect(sdkFn).toHaveBeenCalledWith(
      expect.objectContaining({ path: { productId: 100 } }),
    );
  });

  test("error path: throws when sdkFn returns error", async () => {
    const sdkFn = mock(() =>
      Promise.resolve({ error: { status: 404, message: "Not Found" } }),
    );

    const tool = createToolFromOperation({
      id: "VTEX_GET_PRODUCT_VARIATIONS",
      description: "Get all SKU variations for a product.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zProductVariationsData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    await expect(
      tool.execute({
        runtimeContext: mockRuntimeContext,
        context: { productId: 9999 },
      }),
    ).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SKU
// ──────────────────────────────────────────────────────────────────────────────

describe("VTEX_GET_SKU", () => {
  test("happy path: returns SKU data and calls sdkFn with correct path param", async () => {
    const fixture = { Id: 1001, ProductId: 100, Name: "Test SKU" };
    const sdkFn = mock(() => Promise.resolve({ data: fixture }));

    const tool = createToolFromOperation({
      id: "VTEX_GET_SKU",
      description: "Get SKU details by ID.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zSkuContextData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    const result = await tool.execute({
      runtimeContext: mockRuntimeContext,
      context: { skuId: 1001 },
    });

    expect(result).toEqual(fixture);
    expect(sdkFn).toHaveBeenCalledTimes(1);
    expect(sdkFn).toHaveBeenCalledWith(
      expect.objectContaining({ path: { skuId: 1001 } }),
    );
  });

  test("error path: throws when sdkFn returns error", async () => {
    const sdkFn = mock(() =>
      Promise.resolve({ error: { status: 404, message: "Not Found" } }),
    );

    const tool = createToolFromOperation({
      id: "VTEX_GET_SKU",
      description: "Get SKU details by ID.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zSkuContextData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    await expect(
      tool.execute({
        runtimeContext: mockRuntimeContext,
        context: { skuId: 9999 },
      }),
    ).rejects.toThrow();
  });
});

describe("VTEX_LIST_SKUS_BY_PRODUCT", () => {
  test("happy path: returns SKU IDs and calls sdkFn with correct path param", async () => {
    const fixture = [1001, 1002, 1003];
    const sdkFn = mock(() => Promise.resolve({ data: fixture }));

    const tool = createToolFromOperation({
      id: "VTEX_LIST_SKUS_BY_PRODUCT",
      description: "List all SKU IDs for a given product.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zSkulistbyProductIdData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    const result = await tool.execute({
      runtimeContext: mockRuntimeContext,
      context: { productId: 100 },
    });

    expect(result).toEqual(fixture);
    expect(sdkFn).toHaveBeenCalledTimes(1);
    expect(sdkFn).toHaveBeenCalledWith(
      expect.objectContaining({ path: { productId: 100 } }),
    );
  });

  test("error path: throws when sdkFn returns error", async () => {
    const sdkFn = mock(() =>
      Promise.resolve({ error: { status: 404, message: "Not Found" } }),
    );

    const tool = createToolFromOperation({
      id: "VTEX_LIST_SKUS_BY_PRODUCT",
      description: "List all SKU IDs for a given product.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zSkulistbyProductIdData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    await expect(
      tool.execute({
        runtimeContext: mockRuntimeContext,
        context: { productId: 9999 },
      }),
    ).rejects.toThrow();
  });
});

describe("VTEX_GET_SKU_FILES", () => {
  test("happy path: returns SKU files and calls sdkFn with correct path param", async () => {
    const fixture = [
      {
        Id: 1,
        Name: "front.jpg",
        IsMain: true,
        Url: "https://example.com/img.jpg",
      },
    ];
    const sdkFn = mock(() => Promise.resolve({ data: fixture }));

    const tool = createToolFromOperation({
      id: "VTEX_GET_SKU_FILES",
      description: "Get all images/files associated with a SKU.",
      annotations: { readOnlyHint: true },
      requestSchema:
        catalogZod.zGetApiCatalogPvtStockkeepingunitBySkuIdFileData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    const result = await tool.execute({
      runtimeContext: mockRuntimeContext,
      context: { skuId: 1001 },
    });

    expect(result).toEqual(fixture);
    expect(sdkFn).toHaveBeenCalledTimes(1);
    expect(sdkFn).toHaveBeenCalledWith(
      expect.objectContaining({ path: { skuId: 1001 } }),
    );
  });

  test("error path: throws when sdkFn returns error", async () => {
    const sdkFn = mock(() =>
      Promise.resolve({ error: { status: 404, message: "Not Found" } }),
    );

    const tool = createToolFromOperation({
      id: "VTEX_GET_SKU_FILES",
      description: "Get all images/files associated with a SKU.",
      annotations: { readOnlyHint: true },
      requestSchema:
        catalogZod.zGetApiCatalogPvtStockkeepingunitBySkuIdFileData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    await expect(
      tool.execute({
        runtimeContext: mockRuntimeContext,
        context: { skuId: 9999 },
      }),
    ).rejects.toThrow();
  });
});

describe("VTEX_LIST_ALL_SKUS", () => {
  test("happy path: returns SKU IDs and calls sdkFn with correct query params", async () => {
    const fixture = [1001, 1002, 1003];
    const sdkFn = mock(() => Promise.resolve({ data: fixture }));

    const tool = createToolFromOperation({
      id: "VTEX_LIST_ALL_SKUS",
      description: "List all SKU IDs in the catalog with pagination.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zListallSkuidsData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    const result = await tool.execute({
      runtimeContext: mockRuntimeContext,
      context: { page: 1, pagesize: 100 },
    });

    expect(result).toEqual(fixture);
    expect(sdkFn).toHaveBeenCalledTimes(1);
    expect(sdkFn).toHaveBeenCalledWith(
      expect.objectContaining({ query: { page: 1, pagesize: 100 } }),
    );
  });

  test("error path: throws when sdkFn returns error", async () => {
    const sdkFn = mock(() =>
      Promise.resolve({
        error: { status: 500, message: "Internal Server Error" },
      }),
    );

    const tool = createToolFromOperation({
      id: "VTEX_LIST_ALL_SKUS",
      description: "List all SKU IDs in the catalog with pagination.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zListallSkuidsData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    await expect(
      tool.execute({
        runtimeContext: mockRuntimeContext,
        context: { page: 1, pagesize: 100 },
      }),
    ).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Orders
// ──────────────────────────────────────────────────────────────────────────────

describe("VTEX_GET_ORDER", () => {
  test("happy path: returns order data and calls sdkFn with correct path param", async () => {
    const fixture = { orderId: "1268540501456-01", status: "invoiced" };
    const sdkFn = mock(() => Promise.resolve({ data: fixture }));

    const tool = createToolFromOperation({
      id: "VTEX_GET_ORDER",
      description: "Get full details of a specific order by order ID.",
      annotations: { readOnlyHint: true },
      requestSchema: ordersZod.zGetOrderData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    const result = await tool.execute({
      runtimeContext: mockRuntimeContext,
      context: { orderId: "1268540501456-01" },
    });

    expect(result).toEqual(fixture);
    expect(sdkFn).toHaveBeenCalledTimes(1);
    expect(sdkFn).toHaveBeenCalledWith(
      expect.objectContaining({ path: { orderId: "1268540501456-01" } }),
    );
  });

  test("error path: throws when sdkFn returns error", async () => {
    const sdkFn = mock(() =>
      Promise.resolve({ error: { status: 404, message: "Not Found" } }),
    );

    const tool = createToolFromOperation({
      id: "VTEX_GET_ORDER",
      description: "Get full details of a specific order by order ID.",
      annotations: { readOnlyHint: true },
      requestSchema: ordersZod.zGetOrderData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    await expect(
      tool.execute({
        runtimeContext: mockRuntimeContext,
        context: { orderId: "does-not-exist-01" },
      }),
    ).rejects.toThrow();
  });
});

describe("VTEX_LIST_ORDERS", () => {
  test("happy path: returns orders list and calls sdkFn with query params", async () => {
    const fixture = {
      list: [{ orderId: "1268540501456-01" }],
      paging: { total: 1 },
    };
    const sdkFn = mock(() => Promise.resolve({ data: fixture }));

    const tool = createToolFromOperation({
      id: "VTEX_LIST_ORDERS",
      description: "List orders with optional filters.",
      annotations: { readOnlyHint: true },
      requestSchema: ordersZod.zListOrdersData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    const result = await tool.execute({
      runtimeContext: mockRuntimeContext,
      context: { page: 1, per_page: 15 },
    });

    expect(result).toEqual(fixture);
    expect(sdkFn).toHaveBeenCalledTimes(1);
    expect(sdkFn).toHaveBeenCalledWith(
      expect.objectContaining({ query: { page: 1, per_page: 15 } }),
    );
  });

  test("error path: throws when sdkFn returns error", async () => {
    const sdkFn = mock(() =>
      Promise.resolve({
        error: { status: 500, message: "Internal Server Error" },
      }),
    );

    const tool = createToolFromOperation({
      id: "VTEX_LIST_ORDERS",
      description: "List orders with optional filters.",
      annotations: { readOnlyHint: true },
      requestSchema: ordersZod.zListOrdersData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    await expect(
      tool.execute({ runtimeContext: mockRuntimeContext, context: {} }),
    ).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Collection
// ──────────────────────────────────────────────────────────────────────────────

describe("VTEX_GET_COLLECTION", () => {
  test("happy path: returns collection data and calls sdkFn with correct path param", async () => {
    const fixture = { Id: 200, Name: "Summer Collection", IsActive: true };
    const sdkFn = mock(() => Promise.resolve({ data: fixture }));

    const tool = createToolFromOperation({
      id: "VTEX_GET_COLLECTION",
      description: "Get collection details by ID.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zGetApiCatalogPvtCollectionByCollectionIdData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    const result = await tool.execute({
      runtimeContext: mockRuntimeContext,
      context: { collectionId: 200 },
    });

    expect(result).toEqual(fixture);
    expect(sdkFn).toHaveBeenCalledTimes(1);
    expect(sdkFn).toHaveBeenCalledWith(
      expect.objectContaining({ path: { collectionId: 200 } }),
    );
  });

  test("error path: throws when sdkFn returns error", async () => {
    const sdkFn = mock(() =>
      Promise.resolve({ error: { status: 404, message: "Not Found" } }),
    );

    const tool = createToolFromOperation({
      id: "VTEX_GET_COLLECTION",
      description: "Get collection details by ID.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zGetApiCatalogPvtCollectionByCollectionIdData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    await expect(
      tool.execute({
        runtimeContext: mockRuntimeContext,
        context: { collectionId: 9999 },
      }),
    ).rejects.toThrow();
  });
});

describe("VTEX_LIST_COLLECTIONS", () => {
  test("happy path: returns collections list and calls sdkFn once", async () => {
    const fixture = [{ Id: 200, Name: "Summer Collection" }];
    const sdkFn = mock(() => Promise.resolve({ data: fixture }));

    const tool = createToolFromOperation({
      id: "VTEX_LIST_COLLECTIONS",
      description: "List all collections in the catalog.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zGetAllInactiveCollectionsData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    const result = await tool.execute({
      runtimeContext: mockRuntimeContext,
      context: {},
    });

    expect(result).toEqual(fixture);
    expect(sdkFn).toHaveBeenCalledTimes(1);
  });

  test("error path: throws when sdkFn returns error", async () => {
    const sdkFn = mock(() =>
      Promise.resolve({
        error: { status: 500, message: "Internal Server Error" },
      }),
    );

    const tool = createToolFromOperation({
      id: "VTEX_LIST_COLLECTIONS",
      description: "List all collections in the catalog.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zGetAllInactiveCollectionsData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    await expect(
      tool.execute({ runtimeContext: mockRuntimeContext, context: {} }),
    ).rejects.toThrow();
  });
});

describe("VTEX_GET_COLLECTION_PRODUCTS", () => {
  test("happy path: returns collection products and calls sdkFn with correct params", async () => {
    const fixture = {
      Data: [{ ProductId: 100, Name: "Test Product" }],
      Paging: { Total: 1 },
    };
    const sdkFn = mock(() => Promise.resolve({ data: fixture }));

    const tool = createToolFromOperation({
      id: "VTEX_GET_COLLECTION_PRODUCTS",
      description: "Get all products in a collection.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zGetProductsfromacollectionData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    const result = await tool.execute({
      runtimeContext: mockRuntimeContext,
      context: { collectionId: 200, page: 1, pageSize: 50 },
    });

    expect(result).toEqual(fixture);
    expect(sdkFn).toHaveBeenCalledTimes(1);
    expect(sdkFn).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { collectionId: 200 },
        query: { page: 1, pageSize: 50 },
      }),
    );
  });

  test("error path: throws when sdkFn returns error", async () => {
    const sdkFn = mock(() =>
      Promise.resolve({ error: { status: 404, message: "Not Found" } }),
    );

    const tool = createToolFromOperation({
      id: "VTEX_GET_COLLECTION_PRODUCTS",
      description: "Get all products in a collection.",
      annotations: { readOnlyHint: true },
      requestSchema: catalogZod.zGetProductsfromacollectionData,
      sdkFn: sdkFn as any,
    })(mockEnv);

    await expect(
      tool.execute({
        runtimeContext: mockRuntimeContext,
        context: { collectionId: 9999 },
      }),
    ).rejects.toThrow();
  });
});
