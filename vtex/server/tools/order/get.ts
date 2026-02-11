import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const getOrder = (env: Env) =>
  createTool({
    id: "VTEX_GET_ORDER",
    description:
      "Get a specific VTEX order by ID with complete details including items, payment, shipping, customer information, and order status",
    inputSchema: z.object({
      orderId: z.string().describe("The unique order identifier to retrieve"),
    }),
    outputSchema: z.object({
      orderId: z.string().describe("Unique order identifier"),
      sequence: z.string().describe("Order sequence number"),
      marketplaceOrderId: z
        .string()
        .nullable()
        .describe("Marketplace order ID if applicable"),
      marketplaceServicesEndpoint: z
        .string()
        .nullable()
        .describe("Marketplace services endpoint"),
      sellerOrderId: z.string().describe("Seller order ID"),
      origin: z
        .string()
        .describe("Order origin (Marketplace, Fulfillment, etc)"),
      affiliateId: z.string().describe("Affiliate ID"),
      salesChannel: z.string().describe("Sales channel ID"),
      merchantName: z.string().nullable().describe("Merchant name"),
      status: z.string().describe("Current order status code"),
      workflowIsInError: z
        .boolean()
        .optional()
        .describe("Whether workflow has errors"),
      statusDescription: z.string().describe("Human-readable order status"),
      value: z.number().describe("Total order value in cents"),
      creationDate: z.string().describe("Order creation date in ISO format"),
      lastChange: z.string().describe("Last change date"),
      orderGroup: z.string().nullable().describe("Order group identifier"),
      followUpEmail: z.string().describe("Follow-up email address"),
      lastMessage: z.string().nullable().describe("Last message"),
      hostname: z.string().describe("Store hostname"),
      isCompleted: z.boolean().describe("Whether order is completed"),
      roundingError: z.number().describe("Rounding error in cents"),
      orderFormId: z.string().describe("Order form ID"),
      allowCancellation: z.boolean().describe("Whether order can be cancelled"),
      allowEdition: z.boolean().describe("Whether order can be edited"),
      isCheckedIn: z.boolean().describe("Whether order is checked in"),
      authorizedDate: z
        .string()
        .nullable()
        .describe("Payment authorization date"),
      invoicedDate: z.string().nullable().describe("Invoice date"),
      cancelReason: z
        .string()
        .nullable()
        .describe("Cancellation reason if cancelled"),
      checkedInPickupPointId: z
        .string()
        .nullable()
        .optional()
        .describe("Checked in pickup point ID"),
      totals: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            value: z.number(),
          }),
        )
        .describe("Order totals breakdown"),
      sellers: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            logo: z.string().nullable().optional(),
            fulfillmentEndpoint: z.string().nullable(),
          }),
        )
        .describe("Sellers information"),
      clientPreferencesData: z.any().optional().describe("Client preferences"),
      cancellationData: z.any().optional().describe("Cancellation data"),
      taxData: z.any().nullable().optional().describe("Tax data"),
      subscriptionData: z
        .any()
        .nullable()
        .optional()
        .describe("Subscription data"),
      itemMetadata: z.any().optional().describe("Item metadata"),
      marketplace: z
        .object({
          baseURL: z.string(),
          isCertified: z.boolean().nullable(),
          name: z.string(),
        })
        .describe("Marketplace information"),
      storePreferencesData: z
        .object({
          countryCode: z.string(),
          currencyCode: z.string(),
          currencyFormatInfo: z.any().optional(),
          currencyLocale: z.number(),
          currencySymbol: z.string(),
          timeZone: z.string(),
        })
        .describe("Store preferences and currency settings"),
      customData: z.any().nullable().describe("Custom data"),
      commercialConditionData: z
        .any()
        .nullable()
        .describe("Commercial condition data"),
      openTextField: z.any().nullable().describe("Open text field"),
      invoiceData: z.any().nullable().describe("Invoice data"),
      changesAttachment: z.any().nullable().describe("Changes attachment"),
      callCenterOperatorData: z
        .any()
        .nullable()
        .describe("Call center operator data"),
      packageAttachment: z.any().describe("Package attachment information"),
      paymentData: z
        .object({
          transactions: z.array(z.any()),
          giftCards: z.array(z.any()).optional(),
        })
        .describe("Payment information and transaction details"),
      shippingData: z
        .object({
          id: z.string(),
          address: z.any(),
          logisticsInfo: z.array(z.any()),
          trackingHints: z.array(z.any()).nullable().optional(),
          selectedAddresses: z.array(z.any()),
          contactInformation: z.array(z.any()).optional(),
        })
        .describe("Shipping and logistics information"),
      ratesAndBenefitsData: z
        .object({
          id: z.string(),
          rateAndBenefitsIdentifiers: z.array(z.any()),
        })
        .describe("Rates and benefits (promotions) data"),
      marketingData: z
        .any()
        .nullable()
        .optional()
        .describe("Marketing data and UTM parameters"),
      giftRegistryData: z
        .any()
        .nullable()
        .optional()
        .describe("Gift registry data"),
      clientProfileData: z
        .object({
          id: z.string(),
          email: z.string(),
          firstName: z.string(),
          lastName: z.string(),
          documentType: z.string().nullable(),
          document: z.string().nullable(),
          phone: z.string(),
          corporateName: z.string().nullable(),
          tradeName: z.string().nullable(),
          corporateDocument: z.string().nullable(),
          stateInscription: z.string().nullable(),
          corporatePhone: z.string().nullable(),
          isCorporate: z.boolean(),
          userProfileId: z.string().nullable().optional(),
          userProfileVersion: z.string().nullable().optional(),
          customerClass: z.string().nullable(),
          customerCode: z.string().nullable().optional(),
        })
        .describe("Customer profile information"),
      items: z.array(z.any()).describe("Order items with detailed information"),
      marketplaceItems: z
        .array(z.any())
        .nullable()
        .optional()
        .describe("Marketplace items"),
    }),
    execute: async ({ context }) => {
      const credentials = env.MESH_REQUEST_CONTEXT.state;
      const client = new VTEXClient(credentials);
      return client.getOrder(context.orderId);
    },
  });
