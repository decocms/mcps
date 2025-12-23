# Meta Ads Analytics MCP

MCP para análise de desempenho de campanhas do Meta/Facebook Ads.

## Funcionalidades

Este MCP fornece ferramentas para analisar o desempenho de suas campanhas de publicidade no Meta (Facebook/Instagram):

- **Visualizar performance** de campanhas, ad sets e anúncios
- **Obter métricas detalhadas** com breakdowns por idade, gênero, país, dispositivo, etc.
- **Comparar desempenho** entre períodos
- **Analisar ROI e custos** em diferentes níveis

## Tools Disponíveis

### Accounts (3 tools)
| Tool | Descrição |
|------|-----------|
| `META_ADS_GET_AD_ACCOUNTS` | Lista contas de anúncio acessíveis |
| `META_ADS_GET_ACCOUNT_INFO` | Detalhes de uma conta (moeda, timezone, status) |
| `META_ADS_GET_ACCOUNT_PAGES` | Páginas associadas à conta |

### Campaigns (2 tools)
| Tool | Descrição |
|------|-----------|
| `META_ADS_GET_CAMPAIGNS` | Lista campanhas com filtro por status |
| `META_ADS_GET_CAMPAIGN_DETAILS` | Detalhes de uma campanha específica |

### Ad Sets (2 tools)
| Tool | Descrição |
|------|-----------|
| `META_ADS_GET_ADSETS` | Lista ad sets com filtro por campanha |
| `META_ADS_GET_ADSET_DETAILS` | Detalhes de um ad set (targeting, budget) |

### Ads (3 tools)
| Tool | Descrição |
|------|-----------|
| `META_ADS_GET_ADS` | Lista anúncios com filtro por ad set |
| `META_ADS_GET_AD_DETAILS` | Detalhes de um anúncio |
| `META_ADS_GET_AD_CREATIVES` | Criativos de um anúncio |

### Insights (1 tool)
| Tool | Descrição |
|------|-----------|
| `META_ADS_GET_INSIGHTS` | Métricas de performance com breakdowns |

## Métricas de Insights

A tool `get_insights` retorna métricas como:

- **Performance**: impressions, reach, clicks, ctr, cpc, cpm
- **Conversões**: conversions, cost_per_conversion
- **Custos**: spend, cost_per_unique_click

**Breakdowns disponíveis**: age, gender, country, device_platform, publisher_platform

## Autenticação

Este MCP usa OAuth PKCE para autenticação com a Meta Graph API. O usuário será redirecionado para autorizar o acesso à conta de anúncios.

### Permissões necessárias

- `ads_read` - Leitura de informações de anúncios
- `pages_read_engagement` - Leitura de páginas associadas
- `business_management` - Acesso a contas de negócios

## Desenvolvimento

```bash
# Instalar dependências
bun install

# Desenvolvimento local
bun run dev

# Build
bun run build

# Deploy
bun run publish
```

## Exemplos de Uso

```
1. "Liste minhas contas de anúncio" 
   -> META_ADS_GET_AD_ACCOUNTS

2. "Mostre campanhas ativas da conta act_123" 
   -> META_ADS_GET_CAMPAIGNS(account_id: "act_123", status_filter: "ACTIVE")

3. "Como está o desempenho da campanha X nos últimos 7 dias?"
   -> META_ADS_GET_INSIGHTS(object_id: "campaign_id", date_preset: "last_7d")

4. "Compare resultados por idade e gênero" 
   -> META_ADS_GET_INSIGHTS(object_id: "campaign_id", breakdowns: ["age", "gender"])

5. "Quais anúncios tem melhor CTR?"
   -> META_ADS_GET_ADS + META_ADS_GET_INSIGHTS para cada
```

