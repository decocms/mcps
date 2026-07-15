/** Shared GraphQL selection snippets used across tool documents. */

export const MONEY = `{ amount currencyCode }`;
export const MONEY_BAG = `{ shopMoney { amount currencyCode } }`;
export const PAGE_INFO = `pageInfo { hasNextPage endCursor }`;
export const ADDRESS = `{
  name
  company
  address1
  address2
  city
  province
  provinceCode
  zip
  country
  countryCodeV2
  phone
}`;
