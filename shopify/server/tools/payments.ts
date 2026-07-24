/**
 * Shopify Payments / finance tools (read-only): payouts, balance, disputes
 * and balance transactions.
 */
import { z } from "zod";
import { DEFAULT_PAGE_SIZE } from "../constants.ts";
import { flattenConnection, shopifyGraphql } from "../lib/client.ts";
import { MONEY, PAGE_INFO } from "../lib/gql.ts";
import { createShopifyTool, paginationSchema } from "../lib/tool.ts";

function requirePaymentsAccount<T>(account: T | null | undefined): T {
  if (!account) {
    throw new Error(
      "Shopify Payments is not enabled on this store (or the token lacks the read_shopify_payments_payouts / read_shopify_payments_disputes scopes).",
    );
  }
  return account;
}

export const LIST_PAYOUTS_QUERY = `
query ListPayouts($first: Int!, $after: String) {
  shopifyPaymentsAccount {
    defaultCurrency
    payouts(first: $first, after: $after) {
      ${PAGE_INFO}
      nodes {
        id
        legacyResourceId
        issuedAt
        status
        transactionType
        net ${MONEY}
        summary {
          chargesFee ${MONEY}
          chargesGross ${MONEY}
          refundsFee ${MONEY}
          refundsFeeGross ${MONEY}
          adjustmentsFee ${MONEY}
          adjustmentsGross ${MONEY}
          reservedFundsFee ${MONEY}
          reservedFundsGross ${MONEY}
          retriedPayoutsFee ${MONEY}
          retriedPayoutsGross ${MONEY}
        }
      }
    }
  }
}`;

export const listPayouts = createShopifyTool({
  id: "SHOPIFY_LIST_PAYOUTS",
  description:
    "List Shopify Payments payouts (bank transfers) with net amounts and fee summaries.",
  inputSchema: z.object({ ...paginationSchema }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{
      shopifyPaymentsAccount: {
        defaultCurrency?: unknown;
        payouts?: unknown;
      } | null;
    }>(
      creds,
      LIST_PAYOUTS_QUERY,
      { first: input.first ?? DEFAULT_PAGE_SIZE, after: input.after },
      "SHOPIFY_LIST_PAYOUTS",
    );
    const account = requirePaymentsAccount(data.shopifyPaymentsAccount);
    return {
      defaultCurrency: account.defaultCurrency,
      payouts: flattenConnection(account.payouts),
    };
  },
});

export const GET_PAYMENTS_BALANCE_QUERY = `
query GetPaymentsBalance {
  shopifyPaymentsAccount {
    id
    activated
    onboardable
    country
    defaultCurrency
    balance ${MONEY}
    payoutStatementDescriptor
    payoutSchedule { interval weeklyAnchor monthlyAnchor }
  }
}`;

export const getPaymentsBalance = createShopifyTool({
  id: "SHOPIFY_GET_PAYMENTS_BALANCE",
  description:
    "Get the Shopify Payments account status, pending balance and payout schedule.",
  inputSchema: z.object({}),
  handler: async (_input, creds) => {
    const data = await shopifyGraphql<{ shopifyPaymentsAccount: unknown }>(
      creds,
      GET_PAYMENTS_BALANCE_QUERY,
      {},
      "SHOPIFY_GET_PAYMENTS_BALANCE",
    );
    return { account: requirePaymentsAccount(data.shopifyPaymentsAccount) };
  },
});

export const LIST_DISPUTES_QUERY = `
query ListDisputes($first: Int!, $after: String) {
  shopifyPaymentsAccount {
    disputes(first: $first, after: $after) {
      ${PAGE_INFO}
      nodes {
        id
        legacyResourceId
        amount ${MONEY}
        status
        type
        initiatedAt
        evidenceDueBy
        evidenceSentOn
        finalizedOn
        reasonDetails { reason networkReasonCode }
        order { id name }
      }
    }
  }
}`;

export const listDisputes = createShopifyTool({
  id: "SHOPIFY_LIST_DISPUTES",
  description:
    "List Shopify Payments disputes (chargebacks and inquiries) with deadlines and linked orders.",
  inputSchema: z.object({ ...paginationSchema }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{
      shopifyPaymentsAccount: { disputes?: unknown } | null;
    }>(
      creds,
      LIST_DISPUTES_QUERY,
      { first: input.first ?? DEFAULT_PAGE_SIZE, after: input.after },
      "SHOPIFY_LIST_DISPUTES",
    );
    const account = requirePaymentsAccount(data.shopifyPaymentsAccount);
    return { disputes: flattenConnection(account.disputes) };
  },
});

export const LIST_BALANCE_TRANSACTIONS_QUERY = `
query ListBalanceTransactions($first: Int!, $after: String) {
  shopifyPaymentsAccount {
    balanceTransactions(first: $first, after: $after) {
      ${PAGE_INFO}
      nodes {
        id
        type
        test
        transactionDate
        sourceId
        sourceType
        sourceOrderTransactionId
        adjustmentReason
        amount ${MONEY}
        fee ${MONEY}
        net ${MONEY}
        associatedOrder { id name }
      }
    }
  }
}`;

export const listBalanceTransactions = createShopifyTool({
  id: "SHOPIFY_LIST_BALANCE_TRANSACTIONS",
  description:
    "List the Shopify Payments ledger: charges, refunds, fees and payout debits.",
  inputSchema: z.object({ ...paginationSchema }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{
      shopifyPaymentsAccount: { balanceTransactions?: unknown } | null;
    }>(
      creds,
      LIST_BALANCE_TRANSACTIONS_QUERY,
      { first: input.first ?? DEFAULT_PAGE_SIZE, after: input.after },
      "SHOPIFY_LIST_BALANCE_TRANSACTIONS",
    );
    const account = requirePaymentsAccount(data.shopifyPaymentsAccount);
    return {
      balanceTransactions: flattenConnection(account.balanceTransactions),
    };
  },
});

export const paymentTools = [
  listPayouts,
  getPaymentsBalance,
  listDisputes,
  listBalanceTransactions,
];
