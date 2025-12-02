# Google Speech MCP

MCP server para convertação bidirecional entre texto e voz usando Google Cloud APIs.

## 🎯 Funcionalidades

Este MCP oferece duas ferramentas principais:

### 1. `text_to_speech` - Texto para Fala
Converte texto em áudio usando Google Cloud Text-to-Speech API.

**Parâmetros:**
- `text` (obrigatório): Texto para converter (máx. 5000 caracteres)
- `languageCode`: Idioma (pt-BR, en-US, es-ES, etc.) - Padrão: pt-BR
- `voiceName`: Nome da voz (pt-BR-Standard-A, pt-BR-Neural2-A, etc.)
- `audioEncoding`: Formato do áudio (MP3, LINEAR16, OGG_OPUS, MULAW) - Padrão: MP3
- `speakingRate`: Velocidade (0.25 a 4.0) - Padrão: 1.0
- `pitch`: Tom da voz (-20.0 a 20.0 semitons) - Padrão: 0.0

**Saída:**
- `audioContent`: Áudio em base64 que pode ser decodificado e salvo como arquivo
- `audioConfig`: Metadados da configuração de áudio

**Exemplo:**
```json
{
  "text": "Olá, como você está?",
  "languageCode": "pt-BR",
  "voiceName": "pt-BR-Standard-A",
  "audioEncoding": "MP3"
}
```

### 2. `speech_to_text` - Fala para Texto
Converte áudio em texto usando Google Cloud Speech-to-Text API.

**Parâmetros:**
- `audioUrl` (obrigatório): URL do arquivo de áudio
- `languageCode`: Idioma esperado (pt-BR, en-US, etc.) - Padrão: pt-BR
- `model`: Modelo de reconhecimento (default, command_and_search, phone_call, video, medical_conversation, medical_dictation) - Padrão: default
- `enableAutomaticPunctuation`: Adicionar pontuação automaticamente - Padrão: true
- `enableWordTimeOffsets`: Incluir timestamps para cada palavra - Padrão: false

**Saída:**
- `transcript`: Texto transcrito
- `confidence`: Nível de confiança da transcrição (0 a 1)
- `words`: Array com palavras e timestamps (se habilitado)
- `billedDuration`: Duração do áudio faturado

**Exemplo:**
```json
{
  "audioUrl": "https://example.com/audio.mp3",
  "languageCode": "pt-BR",
  "model": "default",
  "enableWordTimeOffsets": true
}
```

## 🚀 Como Usar

### Configuração Inicial

1. Clonar o repositório e navegar ao diretório:
```bash
cd google-speech
bun install
```

2. Obter uma Google Cloud API Key:
   - Ir para [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   - Criar um novo projeto
   - Habilitar APIs: "Cloud Text-to-Speech" e "Cloud Speech-to-Text"
   - Criar uma API Key (tipo: Chave de API)

3. Para desenvolvimento local, criar arquivo `.dev.vars`:
```bash
GOOGLE_API_KEY=sua_api_key_aqui
```

4. Iniciar o servidor de desenvolvimento:
```bash
bun run dev
```

### Deploy

Para usuários finais (marketplace):
- Basta instalar do marketplace Deco
- Configurar a API Key na tela de instalação
- Começar a usar

Para desenvolvedores (auto-hosted):
```bash
bun run deploy
```

## 📦 Implementação Técnica

### Estrutura do Projeto
```
google-speech/
├── server/
│   ├── main.ts              # Entry point e configuração
│   ├── constants.ts         # URLs e configurações das APIs
│   ├── lib/
│   │   └── google-speech-client.ts  # Cliente para APIs Google
│   └── tools/
│       ├── index.ts                 # Agregador de tools
│       ├── text-to-speech.ts        # Tool de TTS
│       └── speech-to-text.ts        # Tool de STT
├── shared/
│   └── deco.gen.ts          # Tipos gerados
└── package.json
```

### Padrões Utilisados

- **StateSchema**: Define configuração do usuário (API Key)
- **Google Cloud APIs**: Text-to-Speech e Speech-to-Text
- **Mastra/MCP Framework**: Para definição e gerenciamento de tools
- **Zod**: Validação de schemas

## 🔗 Referências

- [Google Cloud Text-to-Speech API](https://cloud.google.com/text-to-speech)
- [Google Cloud Speech-to-Text API](https://cloud.google.com/speech-to-text)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Deco Runtime](https://github.com/deco-cx/runtime)

## ⚙️ Configuração de APIs Suportadas

### Idiomas Suportados
- Português (Brasil): `pt-BR`
- English (US): `en-US`
- English (GB): `en-GB`
- Español: `es-ES`, `es-MX`
- Français: `fr-FR`
- Deutsch: `de-DE`
- Italiano: `it-IT`
- 日本語: `ja-JP`
- 中文: `zh-CN`, `zh-TW`
- 한국어: `ko-KR`
- Русский: `ru-RU`
- العربية: `ar-SA`
- हिन्दी: `hi-IN`
- E muitos outros...

### Vozes Disponíveis (Português Brasil)
- Standard: `pt-BR-Standard-A`, `pt-BR-Standard-B`, `pt-BR-Standard-C`
- Neural: `pt-BR-Neural2-A`, `pt-BR-Neural2-B`, `pt-BR-Neural2-C`

## 📝 Licença

MIT

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor:
1. Faça um Fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

