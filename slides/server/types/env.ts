/**
 * Environment Type Definitions for Slides MCP
 */
import {
  BindingOf,
  type DefaultEnv,
  type BindingRegistry,
} from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  BRAND: BindingOf("@deco/brand")
    .optional()
    .describe("Brand research - any MCP with BRAND tools"),
});

export type Env = DefaultEnv<typeof StateSchema, BindingRegistry>;
