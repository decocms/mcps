/**
 * Central export point for all VTEX tools.
 *
 * Registry tools are auto-generated from OpenAPI specs via hey-api. They live
 * in `./registry.ts`, which transitively imports ~70 generated zod modules
 * (~35k lines of `z.object()` calls). Importing that statically blew through
 * Cloudflare Workers' startup-CPU budget, so the registry is dynamic-imported
 * inside the tools factory below — esbuild defers evaluation of the chunk
 * until first request, keeping startup minimal.
 */
import type { Env } from "../types/env.ts";

// ── Custom tools (small, cheap, kept eager) ──────────────────────────────────
import { searchCollections } from "./custom/search-collections.ts";
import { reorderCollection } from "./custom/reorder-collection.ts";
import { updateProductSpecifications } from "./custom/update-product-specifications.ts";

const customFactories = [
  searchCollections,
  reorderCollection,
  updateProductSpecifications,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const tools = async (env: Env): Promise<any[]> => {
  const registry = await import("./registry.ts");
  const registryFactories = [
    ...registry.brandTools,
    ...registry.categoryTools,
    ...registry.warehouseTools,
    ...registry.inventoryTools,
    ...registry.priceTools,
    ...registry.productTools,
    ...registry.skuTools,
    ...registry.orderTools,
    ...registry.collectionTools,
    ...registry.adsTools,
    ...registry.antifraudProviderTools,
    ...registry.audienceTools,
    ...registry.b2bBuyerDataTools,
    ...registry.b2bContactInformationTools,
    ...registry.b2bContractsTools,
    ...registry.budgetsTools,
    ...registry.buyerOrganizationsTools,
    ...registry.buyingPoliciesTools,
    ...registry.cardTokenVaultTools,
    ...registry.catalogSellerPortalTools,
    ...registry.checkoutTools,
    ...registry.customFieldsTools,
    ...registry.customerCreditTools,
    ...registry.checkoutCustomCardPaymentTools,
    ...registry.dataSubjectRightsTools,
    ...registry.defaultValuesTools,
    ...registry.deliveryPromiseNotificationTools,
    ...registry.giftcardTools,
    ...registry.giftcardHubTools,
    ...registry.giftcardProviderProtocolTools,
    ...registry.headlessCmsTools,
    ...registry.intelligentSearchTools,
    ...registry.intelligentSearchEventsTools,
    ...registry.legacyCmsPortalTools,
    ...registry.licenseManagerTools,
    ...registry.marketplaceTools,
    ...registry.marketplaceSentOffersTools,
    ...registry.marketplaceSuggestionsTools,
    ...registry.marketplaceProtocolMapperTools,
    ...registry.marketplaceProtocolOrdersTools,
    ...registry.marketplaceProtocolSellerFulfillmentTools,
    ...registry.marketplaceProtocolSellerMarketplaceTools,
    ...registry.masterDataV2Tools,
    ...registry.masterDataV1Tools,
    ...registry.messageCenterTools,
    ...registry.mtlsTools,
    ...registry.operationalCapacityTools,
    ...registry.ordersPiiTools,
    ...registry.organizationUnitsTools,
    ...registry.paymentProviderProtocolTools,
    ...registry.paymentsGatewayTools,
    ...registry.pickAndPackTools,
    ...registry.pickAndPackLastMileTools,
    ...registry.pickAndPackOrderChangesTools,
    ...registry.policiesSystemTools,
    ...registry.pricingHubTools,
    ...registry.profileSystemTools,
    ...registry.promotionsAndTaxesTools,
    ...registry.promotionsAndTaxesV2Tools,
    ...registry.punchoutTools,
    ...registry.recommendationsBffTools,
    ...registry.reviewsAndRatingsTools,
    ...registry.searchTools,
    ...registry.sessionManagerTools,
    ...registry.skuBindingsTools,
    ...registry.sslCertificatesTools,
    ...registry.storefrontPermissionsTools,
    ...registry.subscriptionsV3Tools,
    ...registry.trackingTools,
    ...registry.vtexDoTools,
    ...registry.vtexIdTools,
    ...registry.vtexShippingNetworkTools,
  ];
  // Each entry is `(env) => CreatedTool`. Invoke them here because the runtime
  // treats the function-form `tools` result as the final CreatedTool[] and
  // does not walk for more factories.
  return [...registryFactories, ...customFactories].map((factory) =>
    factory(env),
  );
};
