# Sistema de Deploy com Opt-In

## 🎯 Problema Resolvido

Antes, quando **qualquer MCP** era alterado no repositório, **TODOS os MCPs** listados no `deploy.json` eram deployados automaticamente. Isso causava:

- ⚠️ Downtime desnecessário de bots em produção (como o Discord bot)
- ⚠️ Deploys de MCPs que não mudaram
- ⚠️ Risco de derrubar serviços críticos sem necessidade

## ✅ Solução Implementada

Agora o `deploy.json` funciona como um **sistema de opt-in**:

- ✅ **MCPs listados** no `deploy.json` = Auto-deploy **HABILITADO**
- ✅ **MCPs NÃO listados** = Auto-deploy **DESABILITADO** (apenas deploy manual)
- ✅ Apenas os MCPs que **mudaram** são deployados
- ✅ Fácil de habilitar/desabilitar temporariamente

---

## 📋 Como Funciona

### 1. Detecção de Mudanças

O workflow CI/CD:
1. Detecta quais arquivos mudaram (`git diff`)
2. Identifica quais MCPs foram afetados
3. **Filtra contra `deploy.json`** (novo!)
4. Deploya **apenas** os MCPs que:
   - Mudaram **E**
   - Estão listados no `deploy.json`

### 2. Arquivos Globais

Alguns arquivos afetam **todos os MCPs** quando modificados:
- `.github/workflows/deploy.yml`
- `.github/workflows/deploy-preview.yml`
- `scripts/deploy.ts`
- `scripts/detect-changed-mcps.ts`
- `scripts/filter-deployable-mcps.ts`
- `package.json` (raiz)
- `bun.lockb` (raiz)

**IMPORTANTE:** `deploy.json` **NÃO** está nessa lista - ele é usado apenas como filtro, não como gatilho.

---

## 🚀 Como Usar

### Desabilitar Auto-Deploy Temporariamente

Para desabilitar o auto-deploy de um MCP (ex: `discord-read`):

```bash
# 1. Editar deploy.json e remover a entrada do MCP
# Ou usar um script:
# Remove a entrada do discord-read
git diff deploy.json

# 2. Commit
git add deploy.json
git commit -m "chore: disable auto-deploy for discord-read"
git push
```

Agora o `discord-read` **não será mais deployado automaticamente**, mesmo quando houver mudanças no código.

### Deploy Manual

Para fazer deploy manual de um MCP:

```bash
# Via script local
bun run scripts/deploy.ts discord-read

# Ou via GitHub Actions (workflow_dispatch)
# No GitHub: Actions > Deploy MCPs (Production) > Run workflow > escolher branch
```

### Reabilitar Auto-Deploy

Para reabilitar o auto-deploy:

```bash
# 1. Adicionar de volta ao deploy.json
{
  "discord-read": {
    "site": "discord-read",
    "entrypoint": "./dist/server/main.js",
    "platformName": "kubernetes-bun"
  }
}

# 2. Commit
git add deploy.json
git commit -m "chore: enable auto-deploy for discord-read"
git push
```

---

## 🛠️ Scripts Disponíveis

### `scripts/deploy.ts`

Deploy tradicional de um MCP específico:

```bash
bun run scripts/deploy.ts <mcp-name> [--preview] [--env KEY=VALUE]...
```

- Faz build e deploy de um MCP
- Não verifica o `deploy.json`
- Útil para deploy manual forçado

### `scripts/deploy-selective.ts` (novo!)

Deploy que **respeita o `deploy.json`**:

```bash
bun run scripts/deploy-selective.ts <mcp-name> [--preview] [--env KEY=VALUE]...
```

- Verifica se o MCP está em `deploy.json`
- Se não estiver, **pula o deploy** (exit 0)
- Útil para testes locais seguros

### `scripts/detect-changed-mcps.ts`

Detecta quais MCPs mudaram entre dois commits:

```bash
bun run scripts/detect-changed-mcps.ts [base-ref] [head-ref]
```

- Saída: JSON array `["mcp1", "mcp2"]`
- Usado automaticamente pelo workflow

### `scripts/filter-deployable-mcps.ts` (novo!)

Filtra MCPs contra o `deploy.json`:

```bash
bun run scripts/filter-deployable-mcps.ts '["mcp1","mcp2","mcp3"]'
```

- Entrada: JSON array de MCPs detectados
- Saída: JSON array de MCPs que estão em `deploy.json`
- Usado automaticamente pelo workflow

---

## 📊 Exemplo de Fluxo

### Cenário: Push com mudanças no `discord-read` e `slack-mcp`

```bash
# 1. Developer faz push
git push origin main

# 2. GitHub Actions executa:
CHANGED_MCPS=$(detect-changed-mcps.ts HEAD~1 HEAD)
# Resultado: ["discord-read", "slack-mcp"]

# 3. Filtra contra deploy.json:
DEPLOYABLE_MCPS=$(filter-deployable-mcps.ts '["discord-read", "slack-mcp"]')

# Se discord-read não estiver em deploy.json:
# Resultado: ["slack-mcp"]

# 4. Deploy apenas do slack-mcp
```

**Resultado:** `discord-read` foi modificado mas **não foi deployado** (como desejado).

---

## ⚙️ Workflows CI/CD

### `deploy.yml` (Production)

- Trigger: Push na branch `main`
- Comportamento: Deploya MCPs modificados que estão em `deploy.json`

### `deploy-preview.yml` (Preview)

- Trigger: Pull Request
- Comportamento: Deploya previews dos MCPs modificados que estão em `deploy.json`
- Adiciona comentário no PR com URLs de preview

---

## 💡 Dicas

### 1. Desenvolvimento Iterativo

Durante desenvolvimento ativo de um MCP:

```bash
# Desabilite auto-deploy
# (remover do deploy.json)

# Faça múltiplos commits sem medo

# Quando pronto, faça deploy manual:
bun run scripts/deploy.ts discord-read

# Reabilite auto-deploy quando estável
# (adicionar de volta ao deploy.json)
```

### 2. MCPs Críticos em Produção

Para MCPs com bots ou serviços críticos (Discord, Slack, etc.):

- ✅ Mantenha **fora** do `deploy.json` por padrão
- ✅ Deploy manual após QA completo
- ✅ Adicione ao `deploy.json` apenas quando estável

### 3. MCPs de Baixo Risco

Para MCPs sem estado ou críticos:

- ✅ Mantenha **no** `deploy.json`
- ✅ Auto-deploy acelera o desenvolvimento
- ✅ Previews em PRs facilitam review

---

## 🔍 Troubleshooting

### "Meu MCP mudou mas não foi deployado"

**Causa:** MCP não está em `deploy.json`

**Solução:** Adicione ao `deploy.json` ou faça deploy manual

### "Todos os MCPs foram deployados de uma vez"

**Causa:** Arquivo global foi modificado (ex: `scripts/deploy.ts`)

**Solução:** Normal - mudanças na infraestrutura afetam todos os MCPs

### "Deploy manual não funciona"

**Causa:** Faltando `DECO_DEPLOY_TOKEN` ou dependências

**Solução:**
```bash
# Instalar Deco CLI
bun install -g deco-cli

# Configurar token
export DECO_DEPLOY_TOKEN="your-token"

# Tentar novamente
bun run scripts/deploy.ts discord-read
```

---

## 📚 Referências

- **Workflow de Deploy:** `.github/workflows/deploy.yml`
- **Workflow de Preview:** `.github/workflows/deploy-preview.yml`
- **Scripts de Deploy:** `scripts/` directory
- **Configuração de Deploy:** `deploy.json`

---

**Nota:** Este sistema foi implementado especificamente para resolver o problema do Discord bot sendo derrubado em cada deploy. Agora você tem controle total sobre quando cada MCP é deployado! 🎉

