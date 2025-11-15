# Secrets Necessários para Deploy dos MCPs

Este documento lista todos os secrets necessários para fazer deploy dos MCPs no GitHub Actions.

## Secrets Obrigatórios

### `DECO_DEPLOY_TOKEN`
- **Usado por**: Todos os MCPs
- **Descrição**: Token de autenticação para o Deco CLI
- **Como obter**: Gerado pelo Deco CLI ou dashboard

## Secrets Opcionais (por MCP)

### MCP: `sora`
- **`OPENAI_API_KEY`**: API key da OpenAI para o modelo Sora
  - Obtenha em: https://platform.openai.com/api-keys

### MCP: `veo`
- **`GOOGLE_GENAI_API_KEY`**: API key do Google Generative AI para o modelo Veo
  - Obtenha em: https://aistudio.google.com/app/apikey
  - ⚠️ **Importante**: O código espera `GOOGLE_GENAI_API_KEY`, não `VEO_TOKEN`

### MCP: `nanobanana`
- **`NANOBANANA_API_KEY`**: API key para o serviço Nanobanana (OpenRouter)
  - Obtenha em: https://openrouter.ai/keys

### MCP: `pinecone`
- **`PINECONE_TOKEN`**: Token de API do Pinecone
  - Obtenha em: https://app.pinecone.io/
- **`PINECONE_INDEX`**: Nome do índice Pinecone (se necessário)

## Como Adicionar Secrets no GitHub

1. Vá para seu repositório no GitHub
2. Clique em **Settings** > **Secrets and variables** > **Actions**
3. Clique em **New repository secret**
4. Adicione o nome e valor do secret
5. Clique em **Add secret**

## Como os Secrets São Usados

Os workflows do GitHub Actions passam todos os secrets configurados como variáveis de ambiente para o script de deploy (`scripts/deploy.ts`). O script automaticamente detecta quais variáveis estão definidas e as passa para o comando `deco deploy` usando a flag `--env`.

Cada MCP usa apenas os secrets que precisa, então é seguro configurar todos os secrets mesmo que nem todos os MCPs os utilizem.

## Como Adicionar um Novo Secret

Quando você precisar adicionar suporte para um novo secret:

1. **Adicione o secret no GitHub** (conforme instruções acima)

2. **Atualize o script de deploy** (`scripts/deploy.ts`):
   - Adicione o nome da variável no array `envVarsToPass` (por volta da linha 116)
   ```typescript
   const envVarsToPass = [
     "OPENAI_API_KEY",
     "GOOGLE_GENAI_API_KEY",
     "NANOBANANA_API_KEY",
     "SEU_NOVO_SECRET",  // <- Adicione aqui
     // ...
   ];
   ```

3. **Atualize os workflows**:
   - Em `.github/workflows/deploy.yml` e `.github/workflows/deploy-preview.yml`
   - Adicione a variável na seção `env:` do step de deploy
   ```yaml
   env:
     DECO_DEPLOY_TOKEN: ${{ secrets.DECO_DEPLOY_TOKEN }}
     OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
     SEU_NOVO_SECRET: ${{ secrets.SEU_NOVO_SECRET }}  # <- Adicione aqui
   ```

⚠️ **Nota**: Sim, você ainda precisa editar os workflows, mas agora é mais simples e centralizado. Basta adicionar uma linha na seção `env:`.

## ⚠️ Atenção: Renomeie o Secret VEO_TOKEN

Se você tem um secret chamado `VEO_TOKEN`, você precisa:
1. Criar um novo secret chamado `GOOGLE_GENAI_API_KEY` com o mesmo valor do `VEO_TOKEN`
2. Deletar o secret `VEO_TOKEN` (ou mantê-lo se preferir)

O MCP `veo` espera `GOOGLE_GENAI_API_KEY` no código.

