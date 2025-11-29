/**
 * VTEX Client Tests
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { createClient, type VTEXProduct, type ProductSearchResult } from "./vtex-client.ts";
import { toProduct, pickSku, type Product } from "./transform.ts";

const TEST_ACCOUNT = "brmotorolanew";
const TEST_ENVIRONMENT = "vtexcommercestable";
const CURRENCY = "BRL";

describe("VTEX Client", () => {
  const client = createClient({
    account: TEST_ACCOUNT,
    environment: TEST_ENVIRONMENT,
    salesChannel: "1",
    locale: "pt-BR",
  });

  const baseUrl = `https://${TEST_ACCOUNT}.${TEST_ENVIRONMENT}.com.br`;

  test("searchProducts returns products", async () => {
    const result = await client.searchProducts({
      query: "",
      count: 5,
    });

    expect(result).toBeDefined();
    expect(result.products).toBeArray();
    expect(result.products.length).toBeGreaterThan(0);
    expect(result.recordsFiltered).toBeGreaterThan(0);

    // Check product structure
    const product = result.products[0];
    expect(product.productId).toBeDefined();
    expect(product.productName).toBeDefined();
    expect(product.linkText).toBeDefined();
    expect(product.items).toBeArray();
  });

  test("searchProducts with query returns results", async () => {
    const result = await client.searchProducts({
      query: "motorola",
      count: 5,
    });

    // Query might return 0 results depending on API state, just check structure
    expect(result.products).toBeArray();
    expect(typeof result.recordsFiltered).toBe("number");
  });

  test("getProductBySlug returns a product", async () => {
    // First get a product from search to get a valid slug
    const searchResult = await client.searchProducts({ count: 1 });
    const slug = searchResult.products[0].linkText;

    const product = await client.getProductBySlug(slug);
    
    expect(product).toBeDefined();
    expect(product?.productId).toBeDefined();
    expect(product?.productName).toBeDefined();
    expect(product?.items).toBeArray();
  });

  test("getProductBySlug returns null for invalid slug", async () => {
    const product = await client.getProductBySlug("this-product-does-not-exist-12345");
    expect(product).toBeNull();
  });

  test("getSuggestions returns suggestions", async () => {
    const result = await client.getSuggestions("smart");

    expect(result).toBeDefined();
    expect(result.searches).toBeArray();
  });
});

describe("VTEX Transform", () => {
  const baseUrl = `https://${TEST_ACCOUNT}.${TEST_ENVIRONMENT}.com.br`;
  
  test("pickSku returns available SKU", () => {
    const items = [
      {
        itemId: "123",
        name: "SKU 1",
        nameComplete: "SKU 1 Complete",
        images: [],
        sellers: [
          {
            sellerId: "1",
            sellerName: "Main Seller",
            commertialOffer: {
              Price: 10000,
              ListPrice: 12000,
              AvailableQuantity: 0,
              PriceWithoutDiscount: 12000,
              Installments: [],
            },
          },
        ],
        variations: [],
      },
      {
        itemId: "456",
        name: "SKU 2",
        nameComplete: "SKU 2 Complete",
        images: [],
        sellers: [
          {
            sellerId: "1",
            sellerName: "Main Seller",
            commertialOffer: {
              Price: 10000,
              ListPrice: 12000,
              AvailableQuantity: 5,
              PriceWithoutDiscount: 12000,
              Installments: [],
            },
          },
        ],
        variations: [],
      },
    ];

    const sku = pickSku(items);
    expect(sku.itemId).toBe("456"); // Should pick the available one
  });

  test("toProduct transforms VTEX product to schema.org format", () => {
    const vtexProduct: VTEXProduct = {
      productId: "123",
      productName: "Test Product",
      brand: "Test Brand",
      brandId: 1,
      description: "Test description",
      linkText: "test-product",
      link: "/test-product/p",
      categories: ["/Category/"],
      categoryId: "1",
      items: [
        {
          itemId: "456",
          name: "Test SKU",
          nameComplete: "Test SKU Complete",
          images: [
            {
              imageUrl: "https://example.com/image.jpg",
              imageText: "Image",
              imageLabel: "main",
            },
          ],
          sellers: [
            {
              sellerId: "1",
              sellerName: "Main Seller",
              commertialOffer: {
                Price: 10000,
                ListPrice: 12000,
                AvailableQuantity: 5,
                PriceWithoutDiscount: 12000,
                Installments: [
                  {
                    Value: 10000,
                    NumberOfInstallments: 1,
                    PaymentSystemName: "Visa",
                  },
                ],
              },
            },
          ],
          variations: [
            { name: "Color", values: ["Red"] },
          ],
        },
      ],
      origin: "intelligent-search",
    };

    const sku = pickSku(vtexProduct.items);
    const product = toProduct(vtexProduct, sku, baseUrl, CURRENCY);

    expect(product["@type"]).toBe("Product");
    expect(product.productID).toBe("123");
    expect(product.name).toBe("Test Product");
    expect(product.description).toBe("Test description");
    expect(product.url).toContain("/test-product/p");
    expect(product.brand?.name).toBe("Test Brand");
    expect(product.sku).toBe("456");
    expect(product.offers.lowPrice).toBe(100); // 10000/100
    expect(product.offers.highPrice).toBe(120); // 12000/100
    expect(product.offers.priceCurrency).toBe(CURRENCY);
    expect(product.offers.offers[0].availability).toBe("https://schema.org/InStock");
    expect(product.image.length).toBeGreaterThan(0);
    expect(product.additionalProperty?.length).toBeGreaterThan(0);
    expect(product.isVariantOf?.hasVariant.length).toBeGreaterThan(0);
  });
});

