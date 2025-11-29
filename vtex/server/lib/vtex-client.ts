/**
 * VTEX API Client
 * 
 * Simplified client for VTEX Intelligent Search and Checkout APIs
 */

import type { State } from "../../shared/deco.gen.ts";

// ============================================================================
// Types - Simplified from apps/vtex/utils/types.ts
// ============================================================================

export interface VTEXImage {
  imageUrl: string;
  imageText: string;
  imageLabel: string;
}

export interface VTEXSeller {
  sellerId: string;
  sellerName: string;
  commertialOffer: {
    Price: number;
    ListPrice: number;
    AvailableQuantity: number;
    PriceWithoutDiscount: number;
    Installments: Array<{
      Value: number;
      NumberOfInstallments: number;
      PaymentSystemName: string;
    }>;
  };
}

export interface VTEXItem {
  itemId: string;
  name: string;
  nameComplete: string;
  images: VTEXImage[];
  sellers: VTEXSeller[];
  variations: Array<{
    name: string;
    values: string[];
  }>;
}

export interface VTEXProduct {
  productId: string;
  productName: string;
  brand: string;
  brandId: number;
  description: string;
  linkText: string;
  link: string;
  categories: string[];
  categoryId: string;
  items: VTEXItem[];
  origin: string;
}

export interface ProductSearchResult {
  products: VTEXProduct[];
  recordsFiltered: number;
  correction?: {
    misspelled: boolean;
  };
}

export interface Suggestion {
  searches: Array<{
    term: string;
    count: number;
  }>;
}

export interface OrderForm {
  orderFormId: string;
  items: Array<{
    id: string;
    productId: string;
    name: string;
    skuName: string;
    quantity: number;
    price: number;
    listPrice: number;
    imageUrl: string;
    seller: string;
    sellerName: string;
  }>;
  totalizers: Array<{
    id: string;
    name: string;
    value: number;
  }>;
  value: number;
}

// ============================================================================
// Client
// ============================================================================

export interface ClientConfig {
  account: string;
  environment: string;
  salesChannel: string;
  locale: string;
}

export function createClient(config: ClientConfig) {
  const baseUrl = `https://${config.account}.${config.environment}.com.br`;
  
  const headers = {
    "Accept": "application/json",
    "Content-Type": "application/json",
  };

  return {
    /**
     * Search products using Intelligent Search
     */
    async searchProducts(params: {
      query?: string;
      collection?: string;
      count?: number;
      page?: number;
      sort?: string;
      facets?: string;
    }): Promise<ProductSearchResult> {
      const searchParams = new URLSearchParams({
        page: String(params.page || 1),
        count: String(params.count || 12),
        locale: config.locale,
        hideUnavailableItems: "false",
      });
      
      if (params.query) searchParams.set("query", params.query);
      if (params.sort) searchParams.set("sort", params.sort);
      
      // Build facets path
      let facetsPath = "";
      if (params.collection) {
        facetsPath = `productClusterIds/${params.collection}`;
      } else if (params.facets) {
        facetsPath = params.facets;
      }
      
      const url = `${baseUrl}/api/io/_v/api/intelligent-search/product_search/${facetsPath}?${searchParams}`;
      
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`VTEX search failed: ${response.status}`);
      }
      
      return response.json();
    },

    /**
     * Get product by slug
     */
    async getProductBySlug(slug: string): Promise<VTEXProduct | null> {
      const url = `${baseUrl}/api/catalog_system/pub/products/search/${slug}/p`;
      
      const response = await fetch(url, { headers });
      if (!response.ok) {
        return null;
      }
      
      const products = await response.json();
      return products[0] || null;
    },

    /**
     * Get search suggestions
     */
    async getSuggestions(query: string): Promise<Suggestion> {
      const searchParams = new URLSearchParams({
        query,
        locale: config.locale,
      });
      
      const url = `${baseUrl}/api/io/_v/api/intelligent-search/search_suggestions?${searchParams}`;
      
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`VTEX suggestions failed: ${response.status}`);
      }
      
      return response.json();
    },

    /**
     * Get or create order form (cart)
     */
    async getOrderForm(orderFormId?: string): Promise<OrderForm> {
      const url = orderFormId
        ? `${baseUrl}/api/checkout/pub/orderForm/${orderFormId}`
        : `${baseUrl}/api/checkout/pub/orderForm`;
      
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });
      
      if (!response.ok) {
        throw new Error(`VTEX cart failed: ${response.status}`);
      }
      
      return response.json();
    },

    /**
     * Add items to cart
     */
    async addToCart(
      orderFormId: string,
      items: Array<{ id: string; quantity: number; seller: string }>
    ): Promise<OrderForm> {
      const url = `${baseUrl}/api/checkout/pub/orderForm/${orderFormId}/items`;
      
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          orderItems: items.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            seller: item.seller,
          })),
        }),
      });
      
      if (!response.ok) {
        throw new Error(`VTEX add to cart failed: ${response.status}`);
      }
      
      return response.json();
    },

    /**
     * Update cart items
     */
    async updateCartItems(
      orderFormId: string,
      items: Array<{ index: number; quantity: number }>
    ): Promise<OrderForm> {
      const url = `${baseUrl}/api/checkout/pub/orderForm/${orderFormId}/items/update`;
      
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ orderItems: items }),
      });
      
      if (!response.ok) {
        throw new Error(`VTEX update cart failed: ${response.status}`);
      }
      
      return response.json();
    },
  };
}

/**
 * Gets VTEX client from environment state
 */
export function getClientFromState(state: State) {
  return createClient({
    account: state.account,
    environment: state.environment,
    salesChannel: state.salesChannel,
    locale: state.locale,
  });
}

