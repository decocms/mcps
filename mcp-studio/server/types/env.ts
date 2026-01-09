/**
 * Environment Type Definitions
 *
 * Central definition for the Env type used throughout the workflow system.
 */

import type { Registry } from "@decocms/mcps-shared/registry";
import { BindingOf, type DefaultEnv } from "@decocms/runtime";
import z from "zod";

export const StateSchema = z.object({
  DATABASE: BindingOf("@deco/postgres"),
  EVENT_BUS: BindingOf("@deco/event-bus"),
  CONNECTION: BindingOf("@deco/connection"),
});

export type Env = DefaultEnv<typeof StateSchema, Registry>;
export type { Registry };
