/**
 * VTEX Cart Tools
 * 
 * Tools for managing shopping cart via VTEX Checkout API
 */
import { createPrivateTool } from "@decocms/runtime/mastra";
import type { Env } from "../main.ts";
import { getClientFromState } from "../lib/vtex-client.ts";
import { toCart } from "../lib/transform.ts";
import {
  cartOutputSchema,
  getCartInputSchema,
  addToCartInputSchema,
  updateCartInputSchema,
} from "./schemas.ts";

// ============================================================================
// Tools
// ============================================================================

/**
 * Get app state from environment, with error handling
 */
function getState(env: Env) {
  const state = env.DECO_REQUEST_CONTEXT?.state;
  if (!state?.account) {
    throw new Error("VTEX account not configured. Please configure the MCP with your VTEX account.");
  }
  return state;
}

/**
 * Get or create a shopping cart
 */
export const createGetCartTool = (env: Env) =>
  createPrivateTool({
    id: "VTEX_GET_CART",
    description: "Get an existing shopping cart by ID, or create a new empty cart if no ID is provided.",
    inputSchema: getCartInputSchema,
    outputSchema: cartOutputSchema,
    execute: async ({ context }) => {
      const state = getState(env);
      const client = getClientFromState(state);
      
      const orderForm = await client.getOrderForm(context.orderFormId);
      const cart = toCart(orderForm);

      return { cart };
    },
  });

/**
 * Add items to cart
 */
export const createAddToCartTool = (env: Env) =>
  createPrivateTool({
    id: "VTEX_ADD_TO_CART",
    description: "Add one or more items to a shopping cart. Returns the updated cart.",
    inputSchema: addToCartInputSchema,
    outputSchema: cartOutputSchema,
    execute: async ({ context }) => {
      const state = getState(env);
      const client = getClientFromState(state);
      
      const orderForm = await client.addToCart(
        context.orderFormId,
        context.items,
      );
      const cart = toCart(orderForm);

      return { cart };
    },
  });

/**
 * Update cart items (change quantity or remove)
 */
export const createUpdateCartTool = (env: Env) =>
  createPrivateTool({
    id: "VTEX_UPDATE_CART",
    description: "Update item quantities in a shopping cart. Set quantity to 0 to remove an item. Returns the updated cart.",
    inputSchema: updateCartInputSchema,
    outputSchema: cartOutputSchema,
    execute: async ({ context }) => {
      const state = getState(env);
      const client = getClientFromState(state);
      
      const orderForm = await client.updateCartItems(
        context.orderFormId,
        context.items,
      );
      const cart = toCart(orderForm);

      return { cart };
    },
  });

// Export all cart tools
export const cartTools = [
  createGetCartTool,
  createAddToCartTool,
  createUpdateCartTool,
];
