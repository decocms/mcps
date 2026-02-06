# Supabase Row Level Security (RLS)

## 🔒 Segurança Multi-Tenant

Para garantir que cada conexão/organização só acesse seus próprios dados, usamos **Row Level Security (RLS)** do Supabase.

## 📋 Políticas de Segurança

Execute no Supabase SQL Editor:

```sql
-- ============================================================================
-- Row Level Security Policies
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE discord_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE discord_message ENABLE ROW LEVEL SECURITY;
ALTER TABLE guilds ENABLE ROW LEVEL SECURITY;
ALTER TABLE discord_channel ENABLE ROW LEVEL SECURITY;
ALTER TABLE discord_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE discord_message_reaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE discord_channel_context ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- discord_connections: Cada organização vê só suas conexões
-- ============================================================================

CREATE POLICY "Organizations can read their own connections"
  ON discord_connections FOR SELECT
  USING (organization_id = current_setting('app.organization_id', true));

CREATE POLICY "Organizations can insert their own connections"
  ON discord_connections FOR INSERT
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

CREATE POLICY "Organizations can update their own connections"
  ON discord_connections FOR UPDATE
  USING (organization_id = current_setting('app.organization_id', true));

CREATE POLICY "Organizations can delete their own connections"
  ON discord_connections FOR DELETE
  USING (organization_id = current_setting('app.organization_id', true));

-- ============================================================================
-- discord_message: Acesso baseado em guild_id autorizado
-- ============================================================================

-- Função para verificar se o guild está autorizado para esta conexão
CREATE OR REPLACE FUNCTION is_guild_authorized(check_guild_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  conn_id TEXT;
  auth_guilds TEXT[];
BEGIN
  -- Get connection_id from current settings
  conn_id := current_setting('app.connection_id', true);
  
  IF conn_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Get authorized guilds for this connection
  SELECT authorized_guilds INTO auth_guilds
  FROM discord_connections
  WHERE connection_id = conn_id;
  
  -- If no authorized guilds or empty array, allow all
  IF auth_guilds IS NULL OR array_length(auth_guilds, 1) IS NULL THEN
    RETURN TRUE;
  END IF;
  
  -- Check if guild is in authorized list
  RETURN check_guild_id = ANY(auth_guilds);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE POLICY "Read messages from authorized guilds"
  ON discord_message FOR SELECT
  USING (is_guild_authorized(guild_id));

CREATE POLICY "Insert messages from authorized guilds"
  ON discord_message FOR INSERT
  WITH CHECK (is_guild_authorized(guild_id));

CREATE POLICY "Update messages from authorized guilds"
  ON discord_message FOR UPDATE
  USING (is_guild_authorized(guild_id));

CREATE POLICY "Delete messages from authorized guilds"
  ON discord_message FOR DELETE
  USING (is_guild_authorized(guild_id));

-- ============================================================================
-- guilds: Acesso baseado em guild_id autorizado
-- ============================================================================

CREATE POLICY "Read authorized guilds"
  ON guilds FOR SELECT
  USING (is_guild_authorized(id));

CREATE POLICY "Insert authorized guilds"
  ON guilds FOR INSERT
  WITH CHECK (is_guild_authorized(id));

CREATE POLICY "Update authorized guilds"
  ON guilds FOR UPDATE
  USING (is_guild_authorized(id));

CREATE POLICY "Delete authorized guilds"
  ON guilds FOR DELETE
  USING (is_guild_authorized(id));

-- ============================================================================
-- discord_channel: Acesso baseado em guild_id autorizado
-- ============================================================================

CREATE POLICY "Read channels from authorized guilds"
  ON discord_channel FOR SELECT
  USING (is_guild_authorized(guild_id));

CREATE POLICY "Insert channels from authorized guilds"
  ON discord_channel FOR INSERT
  WITH CHECK (is_guild_authorized(guild_id));

CREATE POLICY "Update channels from authorized guilds"
  ON discord_channel FOR UPDATE
  USING (is_guild_authorized(guild_id));

CREATE POLICY "Delete channels from authorized guilds"
  ON discord_channel FOR DELETE
  USING (is_guild_authorized(guild_id));

-- ============================================================================
-- discord_member: Acesso baseado em guild_id autorizado
-- ============================================================================

CREATE POLICY "Read members from authorized guilds"
  ON discord_member FOR SELECT
  USING (is_guild_authorized(guild_id));

CREATE POLICY "Insert members from authorized guilds"
  ON discord_member FOR INSERT
  WITH CHECK (is_guild_authorized(guild_id));

CREATE POLICY "Update members from authorized guilds"
  ON discord_member FOR UPDATE
  USING (is_guild_authorized(guild_id));

CREATE POLICY "Delete members from authorized guilds"
  ON discord_member FOR DELETE
  USING (is_guild_authorized(guild_id));

-- ============================================================================
-- discord_message_reaction: Acesso através de message_id
-- ============================================================================

CREATE OR REPLACE FUNCTION is_message_authorized(check_message_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  msg_guild_id TEXT;
BEGIN
  SELECT guild_id INTO msg_guild_id
  FROM discord_message
  WHERE id = check_message_id;
  
  IF msg_guild_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  RETURN is_guild_authorized(msg_guild_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE POLICY "Read reactions from authorized messages"
  ON discord_message_reaction FOR SELECT
  USING (is_message_authorized(message_id));

CREATE POLICY "Insert reactions from authorized messages"
  ON discord_message_reaction FOR INSERT
  WITH CHECK (is_message_authorized(message_id));

CREATE POLICY "Update reactions from authorized messages"
  ON discord_message_reaction FOR UPDATE
  USING (is_message_authorized(message_id));

CREATE POLICY "Delete reactions from authorized messages"
  ON discord_message_reaction FOR DELETE
  USING (is_message_authorized(message_id));

-- ============================================================================
-- discord_channel_context: Acesso baseado em guild_id autorizado
-- ============================================================================

CREATE POLICY "Read channel context from authorized guilds"
  ON discord_channel_context FOR SELECT
  USING (is_guild_authorized(guild_id));

CREATE POLICY "Insert channel context from authorized guilds"
  ON discord_channel_context FOR INSERT
  WITH CHECK (is_guild_authorized(guild_id));

CREATE POLICY "Update channel context from authorized guilds"
  ON discord_channel_context FOR UPDATE
  USING (is_guild_authorized(guild_id));

CREATE POLICY "Delete channel context from authorized guilds"
  ON discord_channel_context FOR DELETE
  USING (is_guild_authorized(guild_id));
```

## 🎯 Como Funciona

### 1. Cada chamada à tool define o contexto:

```typescript
// No código do MCP, antes de fazer query:
await supabaseClient.rpc('set_config', {
  key: 'app.connection_id',
  value: connectionId
});

await supabaseClient.rpc('set_config', {
  key: 'app.organization_id', 
  value: organizationId
});
```

### 2. RLS verifica automaticamente:

```
User calls DISCORD_QUERY_MESSAGES({guildId: "123"})
  ↓
RLS check: is_guild_authorized("123")?
  ↓
Busca authorized_guilds da conexão atual
  ↓
Se vazio/null: permite tudo (all guilds)
Se tem lista: verifica se "123" está na lista
  ↓
Retorna só dados autorizados ✅
```

### 3. Isolamento garantido:

- ✅ Conexão A não vê dados da Conexão B
- ✅ Organização A não vê dados da Organização B
- ✅ Guild não autorizado não é acessível
- ✅ Mensagens de outros guilds são bloqueadas

## 🧪 Testar Segurança

```sql
-- Simular contexto da conexão 1
SELECT set_config('app.connection_id', 'conn_123', false);
SELECT set_config('app.organization_id', 'org_abc', false);

-- Deve retornar só dados desta conexão
SELECT * FROM discord_message;

-- Simular outra conexão
SELECT set_config('app.connection_id', 'conn_456', false);
SELECT set_config('app.organization_id', 'org_xyz', false);

-- Deve retornar dados diferentes (ou nada se não tiver)
SELECT * FROM discord_message;
```

## ⚠️ Importante

1. **Sempre definir o contexto** antes de queries
2. **RLS é aplicado automaticamente** - não precisa filtrar manualmente
3. **Mesmo queries diretas** são protegidas pelo RLS
4. **Supabase Admin API** bypassa RLS - usar com cuidado!

## 🔐 Benefícios

- ✅ **Multi-tenant seguro** - cada conexão isolada
- ✅ **Proteção automática** - não precisa lembrar de filtrar
- ✅ **Audit trail** - logs do Supabase mostram acessos
- ✅ **Zero trust** - mesmo se alguém acessa o banco, RLS protege

