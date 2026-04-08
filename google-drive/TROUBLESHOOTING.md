# Troubleshooting - Google Drive MCP

## ❌ Erro: 401 invalid_client

**Mensagem completa:**

```
Acesso bloqueado: erro de autorização
The OAuth client was not found.
Erro 401: invalid_client
```

### Causas Possíveis

1. **Credenciais incorretas no `.env`**
   - Client ID ou Client Secret estão errados
   - Credenciais foram deletadas no Google Cloud Console

2. **Projeto errado no Google Cloud Console**
   - Está usando credenciais de um projeto diferente
   - O projeto foi deletado ou desabilitado

3. **APIs não habilitadas**
   - Google Drive API não está habilitada no projeto

## ✅ Soluções

### 1. Verificar Credenciais

Verifique o arquivo `.env`:

```bash
cat .env
```

Deve conter:

```env
GOOGLE_CLIENT_ID=seu-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=seu-client-secret
```

### 2. Criar Novas Credenciais (se necessário)

1. Acesse: https://console.cloud.google.com/apis/credentials
2. Clique em "Create Credentials" → "OAuth client ID"
3. Application type: "Web application"
4. Name: "Google Drive MCP"
5. Authorized redirect URIs:
   ```
   http://localhost:3000/oauth/callback
   http://localhost:3002/oauth/callback
   http://localhost:3003/oauth/callback
   ```
6. Clique em "Create"
7. Copie o Client ID e Client Secret para o `.env`

### 3. Habilitar APIs Necessárias

Acesse: https://console.cloud.google.com/apis/library

Habilite estas APIs:

- ✅ Google Drive API
- ✅ Google Calendar API
- ✅ Google Docs API
- ✅ Google Sheets API
- ✅ Google Slides API
- ✅ Google Forms API
- ✅ Gmail API
- ✅ Google Meet API

### 4. Configurar OAuth Consent Screen

1. Acesse: https://console.cloud.google.com/apis/credentials/consent
2. User Type: "External" (para testes)
3. App name: "Google MCPs"
4. User support email: seu-email@gmail.com
5. Developer contact: seu-email@gmail.com
6. Scopes: Adicione os scopes necessários:
   - `.../auth/drive`
   - `.../auth/drive.file`
   - `.../auth/calendar`
   - `.../auth/gmail.modify`
   - etc.
7. Test users: Adicione seu email para testes

### 5. Verificar Projeto

Certifique-se de que está no projeto correto:

```bash
# No .env, o Client ID deve terminar com .apps.googleusercontent.com
# E deve corresponder ao projeto que você está vendo no console
```

## 🔗 Links Úteis

- **Google Cloud Console:** https://console.cloud.google.com
- **Credentials:** https://console.cloud.google.com/apis/credentials
- **API Library:** https://console.cloud.google.com/apis/library
- **OAuth Consent Screen:** https://console.cloud.google.com/apis/credentials/consent

## 🐛 Debug

Para verificar se as credenciais estão sendo carregadas:

```typescript
// No código do servidor
console.log("GOOGLE_CLIENT_ID:", process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + "...");
console.log("GOOGLE_CLIENT_SECRET:", process.env.GOOGLE_CLIENT_SECRET ? "configured" : "missing");
```

## 📝 Nota Importante

Todos os MCPs do Google (Calendar, Drive, Docs, Sheets, etc.) usam as **mesmas credenciais OAuth**. Configure uma vez e use em todos!
