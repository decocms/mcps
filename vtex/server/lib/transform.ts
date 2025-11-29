/**
 * Transform VTEX data to standard commerce types
 * 
 * Simplified from apps/vtex/utils/transform.ts
 */

import type { VTEXProduct, VTEXItem, OrderForm } from "./client.ts";

// ============================================================================
// Standard Commerce Types (from apps/commerce/types.ts)
// ============================================================================

export interface Product {
  "@type": "Product";
  productID: string;
  name: string;
  description?: string;
  url: string;
  brand?: {
    "@type": "Brand";
    name: string;
  };
  image: Array<{
    "@type": "ImageObject";
    url: string;
    name?: string;
  }>;
  sku: string;
  offers: {
    "@type": "AggregateOffer";
    lowPrice: number;
    highPrice: number;
    priceCurrency: string;
    offers: Array<{
      "@type": "Offer";
      price: number;
      listPrice: number;
      availability: string;
      seller: string;
      inventoryLevel?: {
        value: number;
      };
      installments?: Array<{
        billingDuration: number;
        billingIncrement: number;
        description: string;
      }>;
    }>;
  };
  isVariantOf?: {
    "@type": "ProductGroup";
    productGroupID: string;
    name: string;
    url: string;
    hasVariant: Array<{
      "@type": "Product";
      sku: string;
      name: string;
      url: string;
      image: Array<{
        "@type": "ImageObject";
        url: string;
      }>;
    }>;
  };
  additionalProperty?: Array<{
    "@type": "PropertyValue";
    name: string;
    value: string;
  }>;
}

export interface Cart {
  id: string;
  items: Array<{
    productId: string;
    sku: string;
    name: string;
    quantity: number;
    price: number;
    listPrice: number;
    image: string;
    seller: string;
  }>;
  total: number;
  subtotal: number;
  coupons: string[];
}

// ============================================================================
// Transform Functions
// ============================================================================

const getAvailability = (quantity: number): string =>
  quantity > 0
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock";

/**
 * Picks the best SKU (first available or first)
 */
export function pickSku(items: VTEXItem[]): VTEXItem {
  const available = items.find(
    (item) => item.sellers.some((s) => s.commertialOffer.AvailableQuantity > 0)
  );
  return available || items[0];
}

/**
 * Transforms VTEX product to standard Product format
 */
export function toProduct(
  vtex: VTEXProduct,
  sku: VTEXItem,
  baseUrl: string,
  currency: string
): Product {
  const seller = sku.sellers.find(
    (s) => s.commertialOffer.AvailableQuantity > 0
  ) || sku.sellers[0];
  
  const price = seller?.commertialOffer.Price || 0;
  const listPrice = seller?.commertialOffer.ListPrice || price;
  const availability = getAvailability(
    seller?.commertialOffer.AvailableQuantity || 0
  );

  // Transform images
  const images = sku.images.map((img) => ({
    "@type": "ImageObject" as const,
    url: img.imageUrl.replace("http://", "https://"),
    name: img.imageText || img.imageLabel,
  }));

  // Transform installments
  const installments = seller?.commertialOffer.Installments?.map((inst) => ({
    billingDuration: inst.NumberOfInstallments,
    billingIncrement: inst.Value / 100,
    description: `${inst.NumberOfInstallments}x ${inst.PaymentSystemName}`,
  }));

  // Build URL
  const url = `${baseUrl}/${vtex.linkText}/p?skuId=${sku.itemId}`;

  // Transform variations to properties
  const additionalProperty = sku.variations?.map((v) => ({
    "@type": "PropertyValue" as const,
    name: v.name,
    value: v.values.join(", "),
  }));

  // Build variants
  const hasVariant = vtex.items.map((item) => ({
    "@type": "Product" as const,
    sku: item.itemId,
    name: item.name,
    url: `${baseUrl}/${vtex.linkText}/p?skuId=${item.itemId}`,
    image: item.images.slice(0, 1).map((img) => ({
      "@type": "ImageObject" as const,
      url: img.imageUrl.replace("http://", "https://"),
    })),
  }));

  return {
    "@type": "Product",
    productID: vtex.productId,
    name: vtex.productName,
    description: vtex.description,
    url,
    brand: {
      "@type": "Brand",
      name: vtex.brand,
    },
    image: images,
    sku: sku.itemId,
    offers: {
      "@type": "AggregateOffer",
      lowPrice: price / 100,
      highPrice: listPrice / 100,
      priceCurrency: currency,
      offers: [
        {
          "@type": "Offer",
          price: price / 100,
          listPrice: listPrice / 100,
          availability,
          seller: seller?.sellerId || "1",
          inventoryLevel: {
            value: seller?.commertialOffer.AvailableQuantity || 0,
          },
          installments,
        },
      ],
    },
    isVariantOf: {
      "@type": "ProductGroup",
      productGroupID: vtex.productId,
      name: vtex.productName,
      url: `${baseUrl}/${vtex.linkText}/p`,
      hasVariant,
    },
    additionalProperty,
  };
}

/**
 * Transform VTEX order form to Cart
 */
export function toCart(orderForm: OrderForm): Cart {
  const subtotal = orderForm.totalizers.find((t) => t.id === "Items")?.value || 0;
  
  return {
    id: orderForm.orderFormId,
    items: orderForm.items.map((item) => ({
      productId: item.productId,
      sku: item.id,
      name: item.name,
      quantity: item.quantity,
      price: item.price / 100,
      listPrice: item.listPrice / 100,
      image: item.imageUrl?.replace("http://", "https://") || "",
      seller: item.seller,
    })),
    total: orderForm.value / 100,
    subtotal: subtotal / 100,
    coupons: [],
  };
}

