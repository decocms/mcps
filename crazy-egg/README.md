# Crazy Egg MCP

Visualize seus heatmaps, A/B tests, funis, recordings e métricas de tráfego do Crazy Egg direto no Claude / Mesh Studio. Inclui dashboard React embutido com gráficos.

## Setup — onde pegar suas chaves

O Crazy Egg usa **3 chaves diferentes**. Configure as que você tiver — cada uma libera um conjunto de tools.

---

### 🔑 1. Tracking Key

**Onde achar:** Dashboard do Crazy Egg → escolhe o site → **Site Settings → API** → copia a "Conversion Tracking API key".

**Variável:** `CRAZY_EGG_TRACKING_KEY`

**Características:**
- É **por site** (cada site tem a sua)
- Vem como `key abc123...`

**O que libera (1 tool):**
| Tool | O que faz |
|---|---|
| `crazy_egg_track_conversion` | Registra um evento de conversão (compra, signup, etc.) |

---

### 🔑 2. API Key + 🔑 3. App Key (par)

**Onde achar:** Dashboard do Crazy Egg → topo da página → **My Account → Options → API**
(URL direta: `https://app.crazyegg.com/options/api`)

A página mostra **dois campos**:
- **API Key** — copie para `CRAZY_EGG_API_KEY`
- **App Key** (também chamada Secret Key) — copie para `CRAZY_EGG_APP_KEY`

**Variáveis:** `CRAZY_EGG_API_KEY` e `CRAZY_EGG_APP_KEY`

**Características:**
- São **conta-wide** (valem para todos os sites da conta)
- Sempre vão **juntas** — uma sem a outra não funciona
- A App Key é **secreta** (assina cada requisição via HMAC-SHA256)

**O que libera (8 tools):**
| Tool | O que faz |
|---|---|
| `crazy_egg_verify_credentials` | Testa se as duas chaves estão corretas |
| `crazy_egg_list_snapshots` | Lista todos os heatmaps com thumbnails |
| `crazy_egg_get_snapshot` | Mostra heatmap completo de uma página |
| `crazy_egg_list_recordings` | Lista session recordings |
| `crazy_egg_list_ab_tests` | Mostra resultados dos A/B tests com gráfico de conversão |
| `crazy_egg_list_funnels` | Mostra funis de conversão com drop-off por estágio |
| `crazy_egg_list_surveys` | Lista pesquisas e contagem de respostas |
| `crazy_egg_get_traffic` | Resumo de visitas/cliques/CTR consolidado |

---

### Resumo

| Você configura | Tools disponíveis |
|---|---|
| Só a Tracking Key | 1 tool (rastrear conversões) |
| Só API Key + App Key | 8 tools (todos os dashboards) |
| **Todas as 3 chaves** | **9 tools — experiência completa** ✨ |

---

## Como configurar

### Para uso no Mesh Studio / Claude

Quando você adicionar o MCP no Mesh, vai aparecer um formulário com 3 campos. Cole as chaves correspondentes em cada um (deixe vazios os que você não tem). Salve e está pronto.

### Para desenvolvimento local

Crie um arquivo `.env` ou exporte as variáveis:

```bash
export CRAZY_EGG_TRACKING_KEY="sua-tracking-key"
export CRAZY_EGG_API_KEY="sua-api-key"
export CRAZY_EGG_APP_KEY="sua-app-key"

cd crazy-egg
bun install
bun run dev
```

Depois acesse `http://localhost:3001/api/mcp`.

### Testando se funcionou

Chame a tool `crazy_egg_verify_credentials` no Claude. Se retornar `{ "authenticated": true }`, está tudo certo.

Se retornar erro 401, alguma das chaves está incorreta — geralmente é a App Key (que assina as requisições).

---

## Estrutura do projeto

```
crazy-egg/
├── api/                      # Servidor MCP (Bun + @decocms/runtime)
│   ├── lib/
│   │   ├── signer.ts         # Assinatura HMAC-SHA256 das requisições
│   │   ├── client.ts         # Cliente HTTP do Crazy Egg
│   │   └── env.ts            # Extração das chaves
│   ├── tools/                # 9 tools MCP
│   ├── resources/            # Resource que serve a UI
│   └── types/env.ts          # StateSchema com as 3 chaves
└── web/                      # UI React (Vite + Recharts + shadcn/ui)
    └── tools/                # Uma página por tool
```

## Comandos

```bash
bun run dev          # Dev server (API + watch do bundle React)
bun test             # Roda os testes (63 testes)
bun run check        # Type-check
bun run build        # Build de produção
```
