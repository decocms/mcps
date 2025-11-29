# VTEX Commerce MCP

MCP server for VTEX e-commerce platform - providing product search, catalog management, and shopping cart operations.

## Features

### Product Tools

- **VTEX_SEARCH_PRODUCTS** - Search products using VTEX Intelligent Search API
  - Query-based search
  - Filter by collection/cluster
  - Pagination and sorting
  - Faceted navigation

- **VTEX_GET_PRODUCT** - Get a single product by URL slug
  - Full product details
  - Variant information
  - Pricing and availability

- **VTEX_GET_SUGGESTIONS** - Get search autocomplete suggestions
  - Type-ahead functionality
  - Popular searches

### Cart Tools

- **VTEX_GET_CART** - Get or create a shopping cart
  - Retrieve existing cart by ID
  - Create new empty cart

- **VTEX_ADD_TO_CART** - Add items to cart
  - Multiple items at once
  - Seller specification

- **VTEX_UPDATE_CART** - Update cart items
  - Change quantities
  - Remove items (set quantity to 0)

## Configuration

When installing this MCP, you need to provide:

| Field | Description | Default |
|-------|-------------|---------|
| `account` | VTEX account name (e.g., "mystore") | Required |
| `environment` | VTEX environment | `vtexcommercestable` |
| `salesChannel` | Sales channel ID | `1` |
| `locale` | Default locale | `pt-BR` |
| `currency` | Currency code | `BRL` |

## Development

```bash
# Install dependencies
bun install

# Start development server
bun run dev

# Type checking
bun run check

# Build for production
bun run build

# Deploy
bun run deploy
```

## API Reference

### Product Search Response

Products are returned in a standardized schema.org-compatible format:

```typescript
interface Product {
  "@type": "Product";
  productID: string;
  name: string;
  description?: string;
  url: string;
  brand?: { "@type": "Brand"; name: string };
  image: Array<{ "@type": "ImageObject"; url: string; name?: string }>;
  sku: string;
  offers: {
    "@type": "AggregateOffer";
    lowPrice: number;
    highPrice: number;
    priceCurrency: string;
    offers: Array<Offer>;
  };
  isVariantOf?: ProductGroup;
  additionalProperty?: Array<PropertyValue>;
}
```

### Cart Response

```typescript
interface Cart {
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
```

## License

MIT

