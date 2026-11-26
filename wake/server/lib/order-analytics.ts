/**
 * `fields: "analytics"` projection of a Wake order (GET /pedidos).
 *
 * A Wake order carries the buyer (name, CPF, e-mail, phones), the street
 * address, card holder and masked number, the Pix QR code and free-text
 * observations — none of which a sales report needs, and all of which would
 * otherwise travel through the gateway and into the caller's logs. This keeps
 * what analytics uses (status, dates, totals, coupon, channel, fulfilling
 * distribution centers, pickup store, city/state, items with promotions,
 * payment group and brand, UTMs and other non-personal metadata) and drops
 * the rest. The projection is a whitelist: a field Wake adds later stays out
 * until someone adds it here.
 */

type Rec = Record<string, unknown>;

const rec = (v: unknown): Rec =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {};
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const str = (v: unknown): string | null =>
  typeof v === "string" && v !== "" ? v : null;
const bool = (v: unknown): boolean | null =>
  typeof v === "boolean" ? v : null;

/** Metadata keys that can name or identify a person (buyer, salesperson, user). */
const PERSONAL_KEY =
  /nome|name|e-?mail|cpf|cnpj|\brg\b|telefone|celular|phone|endereco|address|\bcep\b|documento|usuario|user|cliente|customer|\bip\b/i;

/** Order metadata (UTMs, salesperson code, PDV markers…) minus personal keys and `_` internals. */
export function safeMetadata(entries: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of list(entries)) {
    const key = str(rec(entry).chave);
    const value = rec(entry).valor;
    if (!key || key.startsWith("_") || PERSONAL_KEY.test(key)) continue;
    if (typeof value === "string" || typeof value === "number") {
      out[key] = String(value);
    }
  }
  return out;
}

/** An item adjustment; promotions (JSON with id, nome and cupom) keep their id and coupon. */
function toAdjustment(raw: unknown) {
  const a = rec(raw);
  let promotion: Rec = {};
  const observation = str(a.observacao);
  if (observation?.startsWith("{")) {
    try {
      const parsed = rec(JSON.parse(observation));
      if ("cupom" in parsed && "id" in parsed) promotion = parsed;
    } catch {
      // Not JSON: a free-text note ("Pagamento rateado"); dropped.
    }
  }
  return {
    tipo: num(a.tipo),
    valor: num(a.valor),
    nome: str(a.nome),
    promocaoId: num(promotion.id),
    cupom: str(promotion.cupom),
  };
}

function toItem(raw: unknown) {
  const i = rec(raw);
  const seller = rec(i.seller);
  return {
    produtoVarianteId: num(i.produtoVarianteId),
    sku: str(i.sku),
    ean: str(i.ean),
    quantidade: num(i.quantidade),
    precoVenda: num(i.precoVenda),
    precoPor: num(i.precoPor),
    precoDe: num(i.precoDe),
    valorItem: num(i.valorItem),
    desconto: num(i.desconto),
    isBrinde: bool(i.isBrinde),
    isMarketPlace: bool(i.isMarketPlace),
    seller:
      Object.keys(seller).length > 0
        ? { sellerId: num(seller.sellerId), sellerNome: str(seller.sellerNome) }
        : null,
    centrosDistribuicao: list(i.centroDistribuicao).map((c) => ({
      centroDistribuicaoId: num(rec(c).centroDistribuicaoId),
      quantidade: num(rec(c).quantidade),
    })),
    ajustes: list(i.ajustes).map(toAdjustment),
    atributos: list(i.atributos).map((a) => ({
      nome: str(rec(a).produtoVarianteAtributoNome),
      valor: str(rec(a).produtoVarianteAtributoValor),
    })),
    // Filled only when the call asks camposAdicionais=ProdutoCategorias.
    categorias: list(i.categorias),
  };
}

function toPayment(raw: unknown) {
  const p = rec(raw);
  const info: Record<string, string> = {};
  for (const entry of list(p.informacoesAdicionais)) {
    const key = str(rec(entry).chave);
    const value = str(rec(entry).valor);
    if (key && value) info[key] = value;
  }
  return {
    formaPagamentoId: num(p.formaPagamentoId),
    valorTotal: num(p.valorTotal),
    numeroParcelas: num(p.numeroParcelas),
    valorDesconto: num(p.valorDesconto),
    valorJuros: num(p.valorJuros),
    grupo: info["Grupo Forma Pagamento - Nome"] ?? null,
    grupoExibicao: info["Grupo Forma Pagamento - Nome Exibicao"] ?? null,
    nome: info["Forma Pagamento 1 - Nome"] ?? null,
    bandeira: str(rec(list(p.cartaoCredito)[0]).bandeira),
    adquirente: str(rec(list(p.pagamentoStatus)[0]).adquirente),
  };
}

export function toAnalyticsOrder(raw: unknown) {
  const o = rec(raw);
  const addresses = list(o.pedidoEndereco).map(rec);
  const delivery =
    addresses.find((a) => str(a.tipo) === "Entrega") ?? addresses[0] ?? {};
  const freight = rec(o.frete);
  return {
    pedidoId: num(o.pedidoId),
    situacaoPedidoId: num(o.situacaoPedidoId),
    data: str(o.data),
    dataPagamento: str(o.dataPagamento),
    dataUltimaAtualizacao: str(o.dataUltimaAtualizacao),
    dataEstimadaEntrega: str(o.dataEstimadaEntrega),
    valorTotalPedido: num(o.valorTotalPedido),
    valorSubTotalSemDescontos: num(o.valorSubTotalSemDescontos),
    valorDesconto: num(o.valorDesconto),
    valorFrete: num(o.valorFrete),
    valorDebitoCC: num(o.valorDebitoCC),
    valorCreditoFidelidade: num(o.valorCreditoFidelidade),
    cupomDesconto: str(o.cupomDesconto),
    valido: bool(o.valido),
    primeiraCompra: bool(o.primeiraCompra),
    isChangeOrder: bool(o.isChangeOrder),
    isPreVenda: bool(o.isPreVenda),
    isPedidoEvento: bool(o.isPedidoEvento),
    canalId: num(o.canalId),
    canalNome: str(o.canalNome),
    canalOrigem: str(o.canalOrigem),
    origemPedido:
      typeof o.origemPedido === "number" || typeof o.origemPedido === "string"
        ? o.origemPedido
        : null,
    retiradaLojaId: num(o.retiradaLojaId),
    transacaoId: num(o.transacaoId),
    transacaoPaiId: num(o.transacaoPaiId),
    pedidoSplit: list(o.pedidoSplit).filter(
      (id): id is number => typeof id === "number",
    ),
    marketPlacePedidoId: str(o.marketPlacePedidoId),
    integrador: str(rec(rec(o.omnichannel).integrador).nome),
    endereco: {
      cidade: str(delivery.cidade),
      estado: str(delivery.estado),
      pais: str(delivery.pais),
    },
    frete: {
      freteContratoId: num(freight.freteContratoId),
      freteContrato: str(freight.freteContrato),
      valorFreteCliente: num(freight.valorFreteCliente),
      valorFreteEmpresa: num(freight.valorFreteEmpresa),
      prazoEnvio: num(freight.prazoEnvio),
      retiradaLojaId: num(freight.retiradaLojaId),
      grupoFreteId: num(freight.grupoFreteId),
      centrosDistribuicao: list(freight.centrosDistribuicao).map((c) =>
        num(rec(c).centroDistribuicaoId),
      ),
    },
    itens: list(o.itens).map(toItem),
    pagamentos: list(o.pagamento).map(toPayment),
    metadados: safeMetadata(o.metadados),
  };
}

export type AnalyticsOrder = ReturnType<typeof toAnalyticsOrder>;
