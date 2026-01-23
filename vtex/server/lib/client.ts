/**
 * VTEX API Client
 */
import type { VTEXCredentials } from "../types/env.ts";
import type {
  Product,
  ProductIds,
  CreateProductInput,
  Sku,
  CreateSkuInput,
  Category,
  CategoryTree,
  CreateCategoryInput,
  Brand,
  CreateBrandInput,
} from "../types/catalog.ts";
import type { Order, OrderList } from "../types/order.ts";
import type { InventoryBySku, Warehouse } from "../types/logistics.ts";
import type {
  Price,
  ComputedPrice,
  FixedPrice,
  CreatePriceInput,
  CreateFixedPriceInput,
  PriceTable,
} from "../types/pricing.ts";

export function getCredentials(env: {
  DECO_CHAT_REQUEST_CONTEXT: { state: VTEXCredentials };
}): VTEXCredentials {
  return env.DECO_CHAT_REQUEST_CONTEXT.state;
}

export class VTEXClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(credentials: VTEXCredentials) {
    this.baseUrl = `https://${credentials.accountName}.vtexcommercestable.com.br`;
    this.headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-VTEX-API-AppKey": credentials.appKey,
      "X-VTEX-API-AppToken": credentials.appToken,
    };
  }

  private async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      params?: Record<string, string | number | undefined>;
    },
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;

    if (options?.params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      }
      const qs = searchParams.toString();
      if (qs) url += `?${qs}`;
    }

    const response = await fetch(url, {
      method,
      headers: this.headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`VTEX API Error: ${response.status} - ${text}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : ({} as T);
  }

  // ============ CATALOG - PRODUCTS ============

  async getProduct(productId: number) {
    return this.request<Product>(
      "GET",
      `/api/catalog/pvt/product/${productId}`,
    );
  }

  async listProductIds(from = 1, to = 250) {
    return this.request<ProductIds>(
      "GET",
      "/api/catalog_system/pvt/products/GetProductAndSkuIds",
      {
        params: { _from: from, _to: to },
      },
    );
  }

  async createProduct(data: CreateProductInput) {
    return this.request<Product>("POST", "/api/catalog/pvt/product", {
      body: data,
    });
  }

  async updateProduct(productId: number, data: Partial<CreateProductInput>) {
    return this.request<Product>(
      "PUT",
      `/api/catalog/pvt/product/${productId}`,
      { body: data },
    );
  }

  // ============ CATALOG - SKUs ============

  async getSku(skuId: number) {
    return this.request<Sku>(
      "GET",
      `/api/catalog/pvt/stockkeepingunit/${skuId}`,
    );
  }

  async listSkusByProduct(productId: number) {
    return this.request<Sku[]>(
      "GET",
      `/api/catalog_system/pvt/sku/stockkeepingunitByProductId/${productId}`,
    );
  }

  async createSku(data: CreateSkuInput) {
    return this.request<Sku>("POST", "/api/catalog/pvt/stockkeepingunit", {
      body: data,
    });
  }

  async updateSku(skuId: number, data: Partial<CreateSkuInput>) {
    return this.request<Sku>(
      "PUT",
      `/api/catalog/pvt/stockkeepingunit/${skuId}`,
      { body: data },
    );
  }

  // ============ CATALOG - CATEGORIES ============

  async getCategory(categoryId: number) {
    return this.request<Category>(
      "GET",
      `/api/catalog/pvt/category/${categoryId}`,
    );
  }

  async listCategories(levels = 3) {
    return this.request<CategoryTree[]>(
      "GET",
      `/api/catalog_system/pub/category/tree/${levels}`,
    );
  }

  async createCategory(data: CreateCategoryInput) {
    return this.request<Category>("POST", "/api/catalog/pvt/category", {
      body: data,
    });
  }

  // ============ CATALOG - BRANDS ============

  async getBrand(brandId: number) {
    return this.request<Brand>(
      "GET",
      `/api/catalog_system/pvt/brand/${brandId}`,
    );
  }

  async listBrands() {
    return this.request<Brand[]>("GET", "/api/catalog_system/pvt/brand/list");
  }

  async createBrand(data: CreateBrandInput) {
    return this.request<Brand>("POST", "/api/catalog/pvt/brand", {
      body: data,
    });
  }

  // ============ ORDERS ============

  async getOrder(orderId: string) {
    return this.request<Order>("GET", `/api/oms/pvt/orders/${orderId}`);
  }

  async listOrders(params?: {
    page?: number;
    per_page?: number;
    f_status?: string;
    f_creationDate?: string;
    q?: string;
  }) {
    return this.request<OrderList>("GET", "/api/oms/pvt/orders", { params });
  }

  async cancelOrder(orderId: string) {
    return this.request<{ date: string; orderId: string }>(
      "POST",
      `/api/oms/pvt/orders/${orderId}/cancel`,
    );
  }

  async startHandling(orderId: string) {
    return this.request<{ date: string; orderId: string }>(
      "POST",
      `/api/oms/pvt/orders/${orderId}/start-handling`,
    );
  }

  // ============ LOGISTICS - INVENTORY ============

  async getInventoryBySku(skuId: number) {
    return this.request<InventoryBySku>(
      "GET",
      `/api/logistics/pvt/inventory/skus/${skuId}`,
    );
  }

  async updateInventory(
    skuId: number,
    warehouseId: string,
    data: { quantity: number; unlimitedQuantity?: boolean },
  ) {
    return this.request<void>(
      "PUT",
      `/api/logistics/pvt/inventory/skus/${skuId}/warehouses/${warehouseId}`,
      {
        body: data,
      },
    );
  }

  // ============ LOGISTICS - WAREHOUSES ============

  async getWarehouse(warehouseId: string) {
    return this.request<Warehouse>(
      "GET",
      `/api/logistics/pvt/configuration/warehouses/${warehouseId}`,
    );
  }

  async listWarehouses() {
    return this.request<Warehouse[]>(
      "GET",
      "/api/logistics/pvt/configuration/warehouses",
    );
  }

  // ============ PRICING ============

  async getPrice(skuId: number) {
    return this.request<Price>("GET", `/api/pricing/prices/${skuId}`);
  }

  async getComputedPrice(skuId: number, priceTableId: string) {
    return this.request<ComputedPrice>(
      "GET",
      `/api/pricing/prices/${skuId}/computed/${priceTableId}`,
    );
  }

  async getFixedPrices(skuId: number) {
    return this.request<FixedPrice[]>(
      "GET",
      `/api/pricing/prices/${skuId}/fixed`,
    );
  }

  async createOrUpdatePrice(skuId: number, data: CreatePriceInput) {
    return this.request<void>("PUT", `/api/pricing/prices/${skuId}`, {
      body: data,
    });
  }

  async createOrUpdateFixedPrice(
    skuId: number,
    priceTableId: string,
    data: CreateFixedPriceInput[],
  ) {
    return this.request<void>(
      "POST",
      `/api/pricing/prices/${skuId}/fixed/${priceTableId}`,
      { body: data },
    );
  }

  async deletePrice(skuId: number) {
    return this.request<void>("DELETE", `/api/pricing/prices/${skuId}`);
  }

  async listPriceTables() {
    return this.request<PriceTable[]>("GET", "/api/pricing/tables");
  }
}
