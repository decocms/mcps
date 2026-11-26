import { afterEach, describe, expect, it } from "bun:test";
import type { Env } from "../types/env.ts";
import {
  ADMIN_TOKEN_REJECTED,
  adminErrorMessage,
  buildQueryString,
  createAdminClient,
} from "./admin.ts";
import { RATE_LIMITED } from "./rate-gate.ts";

describe("adminErrorMessage", () => {
  it("tells the user to renew a rejected apiToken", () => {
    for (const status of [401, 403]) {
      const message = adminErrorMessage(status, "Unauthorized", "");
      expect(message.startsWith(ADMIN_TOKEN_REJECTED)).toBe(true);
      expect(message).toContain("update the apiToken");
    }
  });

  it("keeps other failures as they are", () => {
    const message = adminErrorMessage(500, "Server Error", "boom");
    expect(message.startsWith(ADMIN_TOKEN_REJECTED)).toBe(false);
    expect(message).toContain("HTTP 500");
  });
});

describe("buildQueryString", () => {
  it("repeats array keys and skips empty values", () => {
    expect(
      buildQueryString({
        camposAdicionais: ["ProdutoCategorias", "ProdutoEan"],
        pagina: 2,
        email: "",
        sku: undefined,
      }),
    ).toBe(
      "?camposAdicionais=ProdutoCategorias&camposAdicionais=ProdutoEan&pagina=2",
    );
  });
});

describe("createAdminClient", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const envWith = (apiToken: string) =>
    ({ MESH_REQUEST_CONTEXT: { state: { apiToken } } }) as unknown as Env;

  const respond = (response: () => Response) => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return response();
    }) as unknown as typeof fetch;
    return () => calls;
  };

  it("returns Wake's x-total-count with a page", async () => {
    respond(
      () =>
        new Response(JSON.stringify([{ pedidoId: 1 }]), {
          headers: { "x-total-count": "263" },
        }),
    );
    const page = await createAdminClient(envWith("token-total")).getPage(
      "/pedidos",
    );
    expect(page).toEqual({ data: [{ pedidoId: 1 }], total: 263 });
  });

  it("has no total when Wake sends none", async () => {
    respond(() => new Response("[]"));
    const page = await createAdminClient(envWith("token-no-total")).getPage(
      "/pedidos",
    );
    expect(page.total).toBeNull();
  });

  it("stops calling Wake after a 429 until Retry-After passes", async () => {
    const calls = respond(
      () =>
        new Response("Too Many Requests", {
          status: 429,
          headers: { "retry-after": "30" },
        }),
    );
    const client = createAdminClient(envWith("token-429"));
    const first = (await client.get("/pedidos").catch((e) => e)) as Error;
    expect(first.message.startsWith(RATE_LIMITED)).toBe(true);
    expect(first.message).toContain("retry-after=30");

    const second = (await client
      .get("/situacoesPedido")
      .catch((e) => e)) as Error;
    expect(second.message.startsWith(RATE_LIMITED)).toBe(true);
    expect(calls()).toBe(1);
  });
});
