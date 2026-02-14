export interface Price {
  itemId: string;
  listPrice: number | null;
  costPrice: number | null;
  markup: number | null;
  basePrice: number;
  fixedPrices: FixedPrice[];
}

export interface FixedPrice {
  tradePolicyId: string;
  value: number;
  listPrice: number | null;
  minQuantity: number;
  dateRange?: {
    from: string;
    to: string;
  };
}

export interface ComputedPrice {
  tradePolicyId: string;
  listPrice: number | null;
  sellingPrice: number;
  priceValidUntil: string | null;
}

export interface CreatePriceInput {
  markup?: number;
  listPrice?: number | null;
  basePrice?: number;
  costPrice?: number | null;
}

export interface CreateFixedPriceInput {
  value: number;
  listPrice?: number | null;
  minQuantity: number;
  dateRange?: {
    from: string;
    to: string;
  };
}

export interface PriceTable {
  id: string;
  name: string;
}
