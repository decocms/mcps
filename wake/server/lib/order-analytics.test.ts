import { describe, expect, it } from "bun:test";
import { safeMetadata, toAnalyticsOrder } from "./order-analytics.ts";

/** Shaped like a GET /pedidos item; every personal value is made up. */
const ORDER = {
  pedidoId: 9001,
  situacaoPedidoId: 9,
  transacaoId: 7001,
  transacaoPaiId: 7000,
  pedidoSplit: [9002],
  data: "2026-11-25T20:00:00",
  dataPagamento: "2026-11-25T20:02:00",
  dataUltimaAtualizacao: "2026-11-26T10:00:00",
  valorFrete: 0,
  valorTotalPedido: 200,
  valorDesconto: 20,
  valorSubTotalSemDescontos: 220,
  cupomDesconto: "CUPOM10",
  canalId: 0,
  canalNome: "",
  canalOrigem: "Loja",
  retiradaLojaId: 0,
  valido: true,
  primeiraCompra: true,
  isChangeOrder: false,
  origemPedido: null,
  usuario: {
    usuarioId: 123,
    nome: "Maria Exemplo",
    cpf: "000.000.000-00",
    email: "maria@example.com",
    telefoneCelular: "(11) 90000-0000",
  },
  pedidoEndereco: [
    {
      tipo: "Entrega",
      nome: "Maria Exemplo",
      logradouro: "Rua Inventada",
      numero: "100",
      cep: "00000-000",
      bairro: "Centro",
      cidade: "Cidade Exemplo",
      estado: "SP",
      pais: "Brasil",
    },
  ],
  frete: {
    freteContratoId: 7,
    freteContrato: "ENTREGA PADRAO",
    valorFreteEmpresa: 15,
    valorFreteCliente: 0,
    prazoEnvio: 4,
    retiradaLojaId: 0,
    grupoFreteId: 3,
    centrosDistribuicao: [{ centroDistribuicaoId: 1, prazoEnvio: 4 }],
  },
  itens: [
    {
      produtoVarianteId: 1001,
      sku: "SKU-1",
      ean: null,
      nome: "Produto Exemplo",
      quantidade: 1,
      precoVenda: 100,
      precoPor: 100,
      precoDe: 150,
      valorItem: 100,
      desconto: 0,
      isBrinde: false,
      isMarketPlace: false,
      seller: null,
      centroDistribuicao: [{ centroDistribuicaoId: 1, quantidade: 1 }],
      atributos: [
        {
          produtoVarianteAtributoNome: "Cor",
          produtoVarianteAtributoValor: "AZUL",
        },
      ],
      categorias: [],
      ajustes: [
        {
          tipo: 6,
          valor: -10,
          nome: "Desconto Exemplo",
          observacao:
            '{"id":500,"nome":"Desconto Exemplo","cupom":"CUPOM10","condicoes":[],"acoes":[{"Tipo":15}]}',
        },
        {
          tipo: 1,
          valor: 5,
          nome: "Frete",
          observacao: '{"Id":"x","TabelaFreteId":7,"CentroDistribuicao":1}',
        },
        {
          tipo: 9,
          valor: -5,
          nome: "Rateio",
          observacao: "Pagamento rateado",
        },
      ],
    },
  ],
  pagamento: [
    {
      formaPagamentoId: 10,
      numeroParcelas: 1,
      valorTotal: 200,
      valorDesconto: 10,
      valorJuros: 0,
      pix: { qrCode: "00020101021226830014br.gov.bcb.pix-made-up" },
      cartaoCredito: [
        {
          numeroCartao: "4111********1111",
          nomeTitular: "MARIA EXEMPLO",
          bandeira: "Visa",
        },
      ],
      pagamentoStatus: [{ adquirente: "Adquirente X", tid: "tid-made-up" }],
      informacoesAdicionais: [
        { chave: "Grupo Forma Pagamento - Nome", valor: "Pix" },
        {
          chave: "Grupo Forma Pagamento - Nome Exibicao",
          valor: "PIX - 5% OFF",
        },
        { chave: "Forma Pagamento 1 - Nome", valor: "Adquirente X" },
      ],
    },
  ],
  observacao: [{ observacao: "Vendedor Nome : Fulano", usuario: "123" }],
  metadados: [
    { chave: "utmSource", valor: "google" },
    { chave: "utmCampaign", valor: "bf" },
    { chave: "VendedorCodigo", valor: "VEND-001" },
    { chave: "VendedorNome", valor: "Fulano" },
    { chave: "_usuarioMaster", valor: "x" },
  ],
  omnichannel: { integrador: { nome: "Hub", pedidoId: "" } },
};

describe("toAnalyticsOrder", () => {
  const out = toAnalyticsOrder(ORDER);
  const json = JSON.stringify(out);

  it("drops personal data", () => {
    for (const personal of [
      "Maria Exemplo",
      "MARIA EXEMPLO",
      "000.000.000-00",
      "maria@example.com",
      "90000-0000",
      "Rua Inventada",
      "00000-000",
      "4111",
      "br.gov.bcb.pix",
      "Fulano",
      "tid-made-up",
    ]) {
      expect(json).not.toContain(personal);
    }
    expect(out).not.toHaveProperty("usuario");
    expect(out).not.toHaveProperty("observacao");
  });

  it("keeps what sales analysis uses", () => {
    expect(out).toMatchObject({
      pedidoId: 9001,
      situacaoPedidoId: 9,
      data: "2026-11-25T20:00:00",
      valorTotalPedido: 200,
      valorDesconto: 20,
      cupomDesconto: "CUPOM10",
      canalOrigem: "Loja",
      transacaoPaiId: 7000,
      pedidoSplit: [9002],
      primeiraCompra: true,
      integrador: "Hub",
      endereco: { cidade: "Cidade Exemplo", estado: "SP", pais: "Brasil" },
      frete: { centrosDistribuicao: [1], prazoEnvio: 4 },
    });
    expect(out.itens[0]).toMatchObject({
      produtoVarianteId: 1001,
      sku: "SKU-1",
      quantidade: 1,
      precoDe: 150,
      centrosDistribuicao: [{ centroDistribuicaoId: 1, quantidade: 1 }],
      atributos: [{ nome: "Cor", valor: "AZUL" }],
    });
    expect(out.pagamentos[0]).toMatchObject({
      formaPagamentoId: 10,
      grupo: "Pix",
      grupoExibicao: "PIX - 5% OFF",
      nome: "Adquirente X",
      bandeira: "Visa",
      adquirente: "Adquirente X",
    });
  });

  it("keeps promotion id and coupon from adjustments, not their notes", () => {
    expect(out.itens[0].ajustes).toEqual([
      {
        tipo: 6,
        valor: -10,
        nome: "Desconto Exemplo",
        promocaoId: 500,
        cupom: "CUPOM10",
      },
      { tipo: 1, valor: 5, nome: "Frete", promocaoId: null, cupom: null },
      { tipo: 9, valor: -5, nome: "Rateio", promocaoId: null, cupom: null },
    ]);
  });

  it("survives a malformed order", () => {
    expect(() => toAnalyticsOrder(null)).not.toThrow();
    expect(toAnalyticsOrder({ itens: "x", pagamento: [null] }).itens).toEqual(
      [],
    );
  });
});

describe("safeMetadata", () => {
  it("keeps UTMs and codes, drops names and internals", () => {
    expect(safeMetadata(ORDER.metadados)).toEqual({
      utmSource: "google",
      utmCampaign: "bf",
      VendedorCodigo: "VEND-001",
    });
  });
});
