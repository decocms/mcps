export interface InventoryBySku {
  skuId: string;
  balance: Array<{
    warehouseId: string;
    warehouseName: string;
    totalQuantity: number;
    reservedQuantity: number;
    hasUnlimitedQuantity: boolean;
  }>;
}

export interface Warehouse {
  id: string;
  name: string;
  warehouseDocks: Array<{
    dockId: string;
    time: string;
    cost: number;
  }>;
}
