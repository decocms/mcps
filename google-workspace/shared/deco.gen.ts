import { type DefaultEnv } from "@decocms/runtime";
import type { Registry } from "@decocms/mcps-shared/registry";
import { z } from "zod";

export const StateSchema = z.object({});

export type Env = DefaultEnv<typeof StateSchema, Registry>;
