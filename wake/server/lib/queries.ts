/**
 * Wake Storefront GraphQL — fragments and read queries.
 *
 * Fragments and selections are mirrored from the production-proven deco.cx Wake
 * app (deco-cx/apps/wake) so they stay valid against the live Storefront API at
 * https://storefront-api.fbits.net/graphql.
 *
 * V1 exposes read-only storefront operations only.
 */

// ── Fragments ────────────────────────────────────────────────────────────────

const PRODUCT = /* GraphQL */ `
fragment Product on Product {
  mainVariant
  productName
  productId
  alias
  attributes { id type value name }
  productCategories { id name url hierarchy main googleCategories }
  informations { title value type }
  available
  averageRating
  condition
  createdAt
  ean
  id
  images { url fileName print }
  minimumOrderQuantity
  prices {
    bestInstallment { discount displayName fees name number value }
    discountPercentage
    discounted
    installmentPlans {
      displayName
      installments { discount fees number value }
      name
    }
    listPrice
    multiplicationFactor
    price
    priceTables { discountPercentage id listPrice price }
    wholesalePrices { price quantity }
  }
  productBrand { fullUrlLogo logoUrl name alias }
  productVariantId
  seller { name }
  parentId
  sku
  numberOfVotes
  stock
  variantName
  variantStock
  collection
  urlVideo
  similarProducts { alias image imageUrl name }
  promotions { content disclosureType id fullStampUrl stamp title }
}
`;

const PRODUCT_VARIANT = /* GraphQL */ `
fragment ProductVariant on ProductVariant {
  aggregatedStock
  alias
  available
  attributes { attributeId displayType id name type value }
  ean
  id
  images { fileName mini order print url }
  productId
  productVariantId
  productVariantName
  sku
  stock
  prices {
    discountPercentage
    discounted
    installmentPlans {
      displayName
      name
      installments { discount fees number value }
    }
    listPrice
    multiplicationFactor
    price
    priceTables { discountPercentage id listPrice price }
    wholesalePrices { price quantity }
    bestInstallment { discount displayName fees name number value }
  }
  offers {
    name
    prices {
      installmentPlans {
        displayName
        installments { discount fees number value }
      }
      listPrice
      price
    }
    productVariantId
  }
  promotions { content disclosureType id fullStampUrl stamp title }
}
`;

const SINGLE_PRODUCT_PART = /* GraphQL */ `
fragment SingleProductPart on SingleProduct {
  mainVariant
  productName
  productId
  alias
  collection
  attributes { name type value attributeId displayType id }
  numberOfVotes
  productCategories { id name url hierarchy main googleCategories }
  informations { title value type }
  available
  averageRating
  breadcrumbs { text link }
  condition
  createdAt
  ean
  id
  images { url fileName print }
  minimumOrderQuantity
  prices {
    bestInstallment { discount displayName fees name number value }
    discountPercentage
    discounted
    installmentPlans {
      displayName
      installments { discount fees number value }
      name
    }
    listPrice
    multiplicationFactor
    price
    priceTables { discountPercentage id listPrice price }
    wholesalePrices { price quantity }
  }
  productBrand { fullUrlLogo logoUrl name alias }
  productVariantId
  seller { name }
  seo { name scheme type httpEquiv content }
  sku
  stock
  variantName
  parallelOptions
  urlVideo
  reviews { rating review reviewDate email customer }
  similarProducts { alias image imageUrl name }
  attributeSelections(includeParentIdVariants: $includeParentIdVariants) {
    selections {
      attributeId
      displayType
      name
      varyByParent
      values { alias available value selected printUrl }
    }
    canBeMatrix
    matrix {
      column { displayType name values { value } }
      data { available productVariantId stock }
      row { displayType name values { value printUrl } }
    }
    selectedVariant { ...ProductVariant }
    candidateVariant { ...ProductVariant }
  }
  promotions { content disclosureType id fullStampUrl stamp title }
}
`;

const SINGLE_PRODUCT = /* GraphQL */ `
fragment SingleProduct on SingleProduct {
  ...SingleProductPart
  buyTogether { productId }
}
`;

const SHIPPING_QUOTE = /* GraphQL */ `
fragment ShippingQuote on ShippingQuote {
  id
  type
  name
  value
  deadline
  shippingQuoteId
  deliverySchedules { date periods { end id start } }
  products { productVariantId value }
}
`;

const BUY_LIST = /* GraphQL */ `
fragment BuyList on BuyList {
  mainVariant
  productName
  productId
  alias
  collection
  kit
  attributes { name type value attributeId displayType id }
  numberOfVotes
  productCategories { id name url hierarchy main googleCategories }
  informations { title value type }
  available
  averageRating
  breadcrumbs { text link }
  condition
  createdAt
  ean
  id
  images { url fileName print }
  minimumOrderQuantity
  prices {
    bestInstallment { discount displayName fees name number value }
    discountPercentage
    discounted
    installmentPlans {
      displayName
      installments { discount fees number value }
      name
    }
    listPrice
    multiplicationFactor
    price
    priceTables { discountPercentage id listPrice price }
    wholesalePrices { price quantity }
  }
  productBrand { fullUrlLogo logoUrl name alias }
  productVariantId
  seller { name }
  seo { name scheme type httpEquiv content }
  sku
  stock
  variantName
  parallelOptions
  urlVideo
  reviews { rating review reviewDate email customer }
  similarProducts { alias image imageUrl name }
  buyTogether { productId }
  promotions { content disclosureType id fullStampUrl stamp title }
  buyListId
  buyListProducts { productId quantity includeSameParent }
}
`;

// ── Queries ──────────────────────────────────────────────────────────────────

export const SEARCH_PRODUCTS = `${PRODUCT}
query Search(
  $operation: Operation!
  $query: String
  $onlyMainVariant: Boolean
  $minimumPrice: Decimal
  $maximumPrice: Decimal
  $limit: Int
  $offset: Int
  $sortDirection: SortDirection
  $sortKey: ProductSearchSortKeys
  $filters: [ProductFilterInput]
) {
  result: search(query: $query, operation: $operation) {
    aggregations {
      maximumPrice
      minimumPrice
      priceRanges { quantity range }
      filters { field origin values { quantity name } }
    }
    breadcrumbs { link text }
    forbiddenTerm { text suggested }
    pageSize
    redirectUrl
    searchTime
    productsByOffset(
      filters: $filters
      limit: $limit
      maximumPrice: $maximumPrice
      minimumPrice: $minimumPrice
      onlyMainVariant: $onlyMainVariant
      offset: $offset
      sortDirection: $sortDirection
      sortKey: $sortKey
    ) {
      items { ...Product }
      page
      pageSize
      totalCount
    }
  }
}`;

export const LIST_PRODUCTS = `${PRODUCT}
query ListProducts(
  $filters: ProductExplicitFiltersInput!
  $first: Int!
  $sortDirection: SortDirection!
  $sortKey: ProductSortKeys!
  $after: String
) {
  products(
    filters: $filters
    first: $first
    sortDirection: $sortDirection
    sortKey: $sortKey
    after: $after
  ) {
    nodes { ...Product }
    totalCount
    pageInfo { hasNextPage endCursor hasPreviousPage startCursor }
  }
}`;

export const GET_PRODUCT = `${PRODUCT_VARIANT}
${SINGLE_PRODUCT_PART}
${SINGLE_PRODUCT}
query GetProduct($productId: Long!, $includeParentIdVariants: Boolean) {
  product(productId: $productId) { ...SingleProduct }
}`;

export const AUTOCOMPLETE = `${PRODUCT}
query Autocomplete($limit: Int, $query: String) {
  autocomplete(limit: $limit, query: $query) {
    suggestions
    products { ...Product }
  }
}`;

export const PRODUCT_RECOMMENDATIONS = `${PRODUCT}
query ProductRecommendations(
  $productId: Long!
  $algorithm: ProductRecommendationAlgorithm!
  $quantity: Int!
) {
  productRecommendations(productId: $productId, algorithm: $algorithm, quantity: $quantity) {
    ...Product
  }
}`;

export const HOTSITE = `${PRODUCT}
query Hotsite(
  $url: String
  $hotsiteId: Long
  $filters: [ProductFilterInput]
  $limit: Int
  $maximumPrice: Decimal
  $minimumPrice: Decimal
  $onlyMainVariant: Boolean
  $offset: Int
  $sortDirection: SortDirection
  $sortKey: ProductSortKeys
) {
  result: hotsite(url: $url, hotsiteId: $hotsiteId) {
    aggregations {
      filters { field origin values { name quantity } }
      maximumPrice
      minimumPrice
      priceRanges { quantity range }
    }
    productsByOffset(
      filters: $filters
      limit: $limit
      maximumPrice: $maximumPrice
      minimumPrice: $minimumPrice
      onlyMainVariant: $onlyMainVariant
      offset: $offset
      sortDirection: $sortDirection
      sortKey: $sortKey
    ) {
      items { ...Product }
      page
      pageSize
      totalCount
    }
    breadcrumbs { link text }
    endDate
    expression
    id
    name
    pageSize
    seo { content httpEquiv name scheme type }
    sorting { direction field }
    startDate
    subtype
    template
    url
    hotsiteId
  }
}`;

export const PRODUCT_OPTIONS = `${PRODUCT_VARIANT}
query ProductOptions($productId: Long!) {
  productOptions(productId: $productId) {
    attributes {
      attributeId
      displayType
      id
      name
      type
      values {
        productVariants { ...ProductVariant }
        value
      }
    }
    id
  }
}`;

export const SHIPPING_QUOTES = `${SHIPPING_QUOTE}
query ShippingQuotes(
  $cep: CEP
  $checkoutId: Uuid
  $productVariantId: Long
  $quantity: Int = 1
  $useSelectedAddress: Boolean
) {
  shippingQuotes(
    cep: $cep
    checkoutId: $checkoutId
    productVariantId: $productVariantId
    quantity: $quantity
    useSelectedAddress: $useSelectedAddress
  ) {
    ...ShippingQuote
  }
}`;

export const BUY_LIST_QUERY = `${BUY_LIST}
query BuyList($id: Long!) {
  buyList(id: $id) { ...BuyList }
}`;

export const SHOP = `
query Shop {
  shop {
    checkoutUrl
    mainUrl
    mobileCheckoutUrl
    mobileUrl
    modifiedName
    name
  }
}`;

export const RESOLVE_URL = `
query ResolveUrl($url: String!) {
  uri(url: $url) {
    hotsiteSubtype
    kind
    partnerSubtype
    productAlias
    productCategoriesIds
    redirectCode
    redirectUrl
  }
}`;
