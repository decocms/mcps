# 🔐 Arquitetura de Segurança - Discord MCP

## Visão Geral

O Discord MCP implementa uma arquitetura de segurança em camadas para proteger informações sensíveis (tokens, credenciais) enquanto permite que o agente de IA acesse dados necessários para suas operações.

## 🏗️ Arquitetura de Dois Níveis

### Nível 1: ANON Key (Tools MCP - Acesso Limitado)

**Usado por:** Tools MCP expostas para o agente de IA

**Características:**

- ✅ RLS (Row Level Security) **HABILITADO**
- ✅ Acesso READ/WRITE a tabelas operacionais
- ❌ **BLOQUEADO** para `discord_connections` (sem RLS policies)

**Tabelas Acessíveis:**

| Tabela                     | READ | INSERT | UPDATE | DELETE |
| -------------------------- | ---- | ------ | ------ | ------ |
| `discord_message`          | ✅   | ✅     | ✅     | ❌     |
| `guilds`                   | ✅   | ✅     | ✅     | ❌     |
| `discord_channel`          | ✅   | ✅     | ✅     | ❌     |
| `discord_member`           | ✅   | ✅     | ✅     | ❌     |
| `discord_message_reaction` | ✅   | ✅     | ✅     | ✅     |
| `discord_channel_context`  | ✅   | ✅     | ✅     | ✅     |
| `discord_voice_state`      | ✅   | ✅     | ✅     | ❌     |
| `discord_audit_log`        | ❌   | ✅     | ❌     | ❌     |

**Variável de Ambiente:**

```bash
export SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Nível 2: SERVICE_ROLE Key (Código Interno - Acesso Completo)

**Usado por:** Código interno do MCP (funções em `supabase-client.ts`)

**Características:**

- ✅ **Bypassa RLS** (Row Level Security desabilitado)
- ✅ Acesso completo a **TODAS** as tabelas
- ✅ Acesso exclusivo a `discord_connections`
- ⚠️ **NUNCA** exposto para tools MCP

**Tabelas Acessíveis:**

| Tabela                | Acesso          | Uso                                |
| --------------------- | --------------- | ---------------------------------- |
| `discord_connections` | ✅ **Completo** | Tokens, credenciais, configurações |
| Todas as outras       | ✅ Completo     | Fallback para operações internas   |

**Variável de Ambiente:**

```bash
export SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 🔒 Proteção da Tabela `discord_connections`

### Por que proteger?

A tabela `discord_connections` contém:

- `bot_token` - Token do bot Discord (acesso completo ao bot)
- `mesh_token` - Token de autenticação do Mesh
- `organization_id` - Identificador da organização
- Outras configurações sensíveis

**Se um agente de IA tivesse acesso direto:**

- ❌ Poderia ler tokens de outros bots
- ❌ Poderia modificar configurações de segurança
- ❌ Poderia comprometer outras organizações

### Como protegemos?

1. **RLS Habilitado** - `ALTER TABLE discord_connections ENABLE ROW LEVEL SECURITY;`
2. **SEM Policies** - Nenhuma policy de SELECT/INSERT/UPDATE/DELETE
3. **Resultado:** Tools com ANON key não conseguem acessar

```sql
-- ❌ Isso vai falhar (sem policies)
SELECT * FROM discord_connections;
-- Error: new row violates row-level security policy
```

4. **Service Client Interno** - Apenas código em `supabase-client.ts` usa SERVICE_ROLE key

```typescript
// ✅ Isso funciona (service client bypassa RLS)
const client = getSupabaseServiceClient();
const { data } = await client.from("discord_connections").select("*");
```

## 📋 Implementação no Código

### `supabase-client.ts` - Dois Clientes

```typescript
// Cliente 1: ANON (para tools)
export function getSupabaseClient(): SupabaseClient | null {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY, // ⚠️  RLS habilitado
  );
}

// Cliente 2: SERVICE (código interno)
export function getSupabaseServiceClient(): SupabaseClient | null {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY, // ✅ Bypassa RLS
  );
}

// ✅ Acessa discord_connections com SERVICE client
export async function loadConnectionConfig(connectionId: string) {
  const client = getSupabaseServiceClient(); // ← SERVICE_ROLE
  return await client.from("discord_connections").select("*").eq("connection_id", connectionId);
}
```

### `tools/database.ts` - Tools usam ANON

```typescript
export const createDatabaseRunSQLTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_DATABASE_RUN_SQL",
    execute: async ({ context }) => {
      // ✅ Usa ANON client (RLS habilitado)
      const client = getSupabaseClient(); // ← ANON KEY

      // ❌ Não pode acessar discord_connections
      const { data } = await client.from("discord_connections").select("*"); // Error: insufficient privilege

      // ✅ Pode acessar outras tabelas
      const { data } = await client.from("discord_message").select("*"); // OK!
    },
  });
```

## 🛡️ Políticas de Segurança (RLS Policies)

### `discord_connections` - Bloqueado

```sql
ALTER TABLE discord_connections ENABLE ROW LEVEL SECURITY;

-- ❌ SEM policies = SEM acesso via ANON key
-- Só SERVICE_ROLE key pode acessar
```

### Outras Tabelas - Acesso Controlado

```sql
-- Exemplo: discord_message
ALTER TABLE discord_message ENABLE ROW LEVEL SECURITY;

-- ✅ Permite leitura
CREATE POLICY "Allow read messages"
  ON discord_message FOR SELECT
  USING (true);

-- ✅ Permite inserção
CREATE POLICY "Allow insert messages"
  ON discord_message FOR INSERT
  WITH CHECK (true);

-- ✅ Permite atualização
CREATE POLICY "Allow update messages"
  ON discord_message FOR UPDATE
  USING (true);

-- ❌ DELETE bloqueado (sem policy)
-- Usa soft delete: UPDATE ... SET deleted = true
```

### `discord_audit_log` - Write Only

```sql
ALTER TABLE discord_audit_log ENABLE ROW LEVEL SECURITY;

-- ✅ SÓ pode inserir
CREATE POLICY "Allow insert audit logs"
  ON discord_audit_log FOR INSERT
  WITH CHECK (true);

-- ❌ Não pode ler/editar/deletar (sem policies)
```

## 📊 Fluxo de Acesso

```
┌─────────────────────────────────────────────────────────────┐
│ Agente de IA (Tools MCP)                                    │
│                                                             │
│  DISCORD_DATABASE_RUN_SQL                                   │
│         │                                                   │
│         ├─> getSupabaseClient() [ANON KEY]                 │
│         │                                                   │
│         ├─> ✅ discord_message (RLS permite)               │
│         ├─> ✅ discord_channel (RLS permite)               │
│         ├─> ✅ discord_member (RLS permite)                │
│         └─> ❌ discord_connections (RLS bloqueia!)         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Código Interno (supabase-client.ts)                         │
│                                                             │
│  saveConnectionConfig()                                     │
│  loadConnectionConfig()                                     │
│  deleteConnectionConfig()                                   │
│         │                                                   │
│         └─> getSupabaseServiceClient() [SERVICE_ROLE KEY]  │
│                                                             │
│             ✅ discord_connections (bypassa RLS)            │
│             ✅ Todas as outras tabelas                      │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Setup Completo

### 1. Execute o SQL de Segurança

```bash
# No Supabase SQL Editor, execute:
cat SUPABASE_SECURITY_FINAL.sql
```

### 2. Configure as Variáveis de Ambiente

```bash
# ANON Key - para tools MCP
export SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# SERVICE_ROLE Key - para código interno
export SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# URL do projeto
export SUPABASE_URL=https://seu-projeto.supabase.co
```

### 3. Verificar Segurança

```typescript
// Teste 1: Tool não consegue acessar discord_connections
const client = getSupabaseClient(); // ANON
const { data, error } = await client.from("discord_connections").select("*");

console.log(error);
// ❌ Error: new row violates row-level security policy

// Teste 2: Código interno consegue
const serviceClient = getSupabaseServiceClient(); // SERVICE_ROLE
const { data, error } = await serviceClient.from("discord_connections").select("*");

console.log(data);
// ✅ [{ connection_id: '...', bot_token: '...' }]
```

## ✅ Checklist de Segurança

- [x] RLS habilitado em TODAS as tabelas
- [x] `discord_connections` sem policies (bloqueado para ANON)
- [x] Tools usam `getSupabaseClient()` (ANON key)
- [x] Código interno usa `getSupabaseServiceClient()` (SERVICE_ROLE)
- [x] SERVICE_ROLE key **NUNCA** exposta em tools
- [x] Soft delete implementado (UPDATE deleted=true, não DELETE físico)
- [x] `discord_audit_log` como write-only
- [x] Variáveis de ambiente documentadas

## 📖 Referências

- `SUPABASE_SECURITY_FINAL.sql` - Script SQL completo
- `server/lib/supabase-client.ts` - Implementação dos clientes
- `server/tools/database.ts` - Tools de acesso ao banco
- `README.md` - Documentação geral
