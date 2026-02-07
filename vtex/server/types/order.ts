export interface Order {
  orderId: string;
  sequence: string;
  status: string;
  statusDescription: string;
  value: number;
  creationDate: string;
  lastChange: string;
  totals: Array<{ id: string; name: string; value: number }>;
  items: OrderItem[];
  clientProfileData: {
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
  };
  shippingData: {
    address: {
      postalCode: string;
      city: string;
      state: string;
      country: string;
      street: string;
      number: string;
      neighborhood: string;
    };
  };
}

export interface OrderItem {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  price: number;
  sellingPrice: number;
  imageUrl: string;
}

export interface OrderList {
  list: Array<{
    orderId: string;
    creationDate: string;
    clientName: string;
    totalValue: number;
    status: string;
    statusDescription: string;
  }>;
  paging: {
    total: number;
    pages: number;
    currentPage: number;
    perPage: number;
  };
}
