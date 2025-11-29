/**
 * Zod schemas for VTEX MCP tools
 * 
 * Centralized schema definitions for input/output validation
 */
import { z } from "zod";

// ============================================================================
// Common Schemas
// ============================================================================

export const productSchema = z.object({
  "@type": z.literal("Product"),
  productID: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  url: z.string(),
  sku: z.string(),
  brand: z.object({
    "@type": z.literal("Brand"),
    name: z.string(),
  }).optional(),
  image: z.array(z.object({
    "@type": z.literal("ImageObject"),
    url: z.string(),
    alternateName: z.string().optional(),
  })),
  offers: z.object({
    "@type": z.literal("AggregateOffer"),
    lowPrice: z.number(),
    highPrice: z.number(),
    priceCurrency: z.string(),
    offers: z.array(z.object({
      "@type": z.literal("Offer"),
      price: z.number(),
      availability: z.string(),
      seller: z.string(),
      inventoryLevel: z.number().optional(),
    })),
  }),
  additionalProperty: z.array(z.object({
    "@type": z.literal("PropertyValue"),
    name: z.string(),
    value: z.string(),
  })).optional(),
  isVariantOf: z.object({
    "@type": z.literal("ProductGroup"),
    productGroupID: z.string(),
    name: z.string(),
    hasVariant: z.array(z.any()),
  }).optional(),
});

export const cartItemSchema = z.object({
  productId: z.string(),
  sku: z.string(),
  name: z.string(),
  quantity: z.number(),
  price: z.number(),
  listPrice: z.number(),
  image: z.string(),
  seller: z.string(),
});

export const cartSchema = z.object({
  id: z.string(),
  items: z.array(cartItemSchema),
  total: z.number(),
  subtotal: z.number(),
  coupons: z.array(z.string()),
});

// ============================================================================
// Product Tool Schemas
// ============================================================================

export const searchProductsInputSchema = z.object({
  query: z.string().optional().describe("Search query string"),
  collection: z.string().optional().describe("Collection/cluster ID to filter by"),
  count: z.number().min(1).max(50).default(12).describe("Number of products to return"),
  page: z.number().min(1).default(1).describe("Page number for pagination"),
  sort: z.enum([
    "OrderByScoreDESC",
    "OrderByPriceDESC",
    "OrderByPriceASC",
    "OrderByTopSaleDESC",
    "OrderByReviewRateDESC",
    "OrderByNameDESC",
    "OrderByNameASC",
    "OrderByReleaseDateDESC",
    "OrderByBestDiscountDESC",
  ]).optional().describe("Sort order"),
  facets: z.string().optional().describe("Facets path (e.g., 'category-1/shoes')"),
});

export const searchProductsOutputSchema = z.object({
  products: z.array(z.any()).describe("Array of products in standard format"),
  total: z.number().describe("Total number of products matching the query"),
  page: z.number().describe("Current page number"),
  pageSize: z.number().describe("Number of products per page"),
});

export const getProductInputSchema = z.object({
  slug: z.string().describe("Product URL slug (linkText)"),
});

export const getProductOutputSchema = z.object({
  product: z.any().nullable().describe("Product in standard format, or null if not found"),
});

export const getSuggestionsInputSchema = z.object({
  query: z.string().min(1).describe("Search query for suggestions"),
});

export const getSuggestionsOutputSchema = z.object({
  suggestions: z.array(z.object({
    term: z.string(),
    count: z.number(),
  })).describe("List of search suggestions"),
});

// ============================================================================
// Cart Tool Schemas
// ============================================================================

export const cartOutputSchema = z.object({
  cart: cartSchema.describe("Shopping cart"),
});

export const getCartInputSchema = z.object({
  orderFormId: z.string().optional().describe("Existing cart ID. If not provided, creates a new cart."),
});

export const addToCartInputSchema = z.object({
  orderFormId: z.string().describe("Cart ID to add items to"),
  items: z.array(z.object({
    id: z.string().describe("SKU ID"),
    quantity: z.number().min(1).describe("Quantity to add"),
    seller: z.string().default("1").describe("Seller ID"),
  })).min(1).describe("Items to add to cart"),
});

export const updateCartInputSchema = z.object({
  orderFormId: z.string().describe("Cart ID to update"),
  items: z.array(z.object({
    index: z.number().min(0).describe("Item index in cart (0-based)"),
    quantity: z.number().min(0).describe("New quantity (0 to remove)"),
  })).min(1).describe("Items to update"),
});

