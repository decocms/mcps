# Datajud MCP Server

MCP (Model Context Protocol) server para integração com a [API Pública do Datajud](https://datajud-wiki.cnj.jus.br/).

## O que é o Datajud?

O **Datajud** é a base nacional de metadados processuais do Poder Judiciário brasileiro, mantida pelo Conselho Nacional de Justiça (CNJ). Centraliza e padroniza informações processuais de todo o país, permitindo consultas, análises e geração de estatísticas sobre a atividade judiciária.

## Funcionalidades

Este MCP oferece três ferramentas principais:

### 🔍 SEARCH_PROCESSES

Busca processos judiciais com filtros avançados:

- Filtrar por classe, assunto, órgão julgador
- Filtrar por data de ajuizamento, grau, instância
- Paginação de resultados
- Ordenação personalizada

### 📋 GET_PROCESS

Consulta um processo específico pelo número:

- Retorna metadados completos do processo
- Inclui movimentações, assuntos, partes
- Baseado no Modelo de Transferência de Dados (MTD)

### 📊 AGGREGATE_STATISTICS

Gera estatísticas e agregações:

- Contagens por classe, assunto, órgão
- Médias de tempo de tramitação
- Distribuição temporal de ajuizamentos
- Usa sintaxe de agregações do Elasticsearch

## Instalação

### 1. Instalar Dependências

```bash
cd datajud
npm install
```

### 2. Configurar API Key

Obtenha a API Key pública do Datajud em:
https://datajud-wiki.cnj.jus.br/api-publica/acesso/

**API Key atual (novembro 2024):**

```
cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==
```

⚠️ **Nota:** A chave pode ser alterada periodicamente pelo CNJ. Sempre verifique a documentação oficial.

### 3. Executar em Desenvolvimento

```bash
npm run dev
```

### 4. Deploy

```bash
npm run deploy
```

## Configuração

Ao instalar o MCP, você precisará configurar:

- **apiKey** (obrigatório): API Key do Datajud para autenticação
- **defaultTribunal** (opcional): Código do tribunal padrão (ex: `tjdft`, `tjsp`, `tjrj`)

Se não configurar um tribunal padrão, será necessário especificar o tribunal em cada chamada de ferramenta.

## Códigos de Tribunais

Alguns códigos de tribunais disponíveis:

### Tribunais de Justiça Estaduais

- `tjdft` - Tribunal de Justiça do Distrito Federal e Territórios
- `tjsp` - Tribunal de Justiça de São Paulo
- `tjrj` - Tribunal de Justiça do Rio de Janeiro
- `tjmg` - Tribunal de Justiça de Minas Gerais
- `tjrs` - Tribunal de Justiça do Rio Grande do Sul
- `tjpr` - Tribunal de Justiça do Paraná
- `tjsc` - Tribunal de Justiça de Santa Catarina
- `tjba` - Tribunal de Justiça da Bahia
- `tjpe` - Tribunal de Justiça de Pernambuco
- `tjce` - Tribunal de Justiça do Ceará

### Tribunais Regionais Federais

- `trf1` - Tribunal Regional Federal da 1ª Região
- `trf2` - Tribunal Regional Federal da 2ª Região
- `trf3` - Tribunal Regional Federal da 3ª Região
- `trf4` - Tribunal Regional Federal da 4ª Região
- `trf5` - Tribunal Regional Federal da 5ª Região
- `trf6` - Tribunal Regional Federal da 6ª Região

### Tribunais Superiores

- `tst` - Tribunal Superior do Trabalho
- `stj` - Superior Tribunal de Justiça
- `stf` - Supremo Tribunal Federal

Consulte a [lista completa de endpoints](https://datajud-wiki.cnj.jus.br/api-publica/acesso/) na documentação oficial.

## Exemplos de Uso

### Buscar processos por classe

```javascript
// Buscar processos de classe "Procedimento Comum" no TJDFT
{
  "tribunal": "tjdft",
  "filters": {
    "classe.nome": "Procedimento Comum"
  },
  "size": 20,
  "sort": [{"dataAjuizamento": "desc"}]
}
```

### Buscar processos de um órgão julgador específico

```javascript
{
  "tribunal": "tjsp",
  "filters": {
    "orgaoJulgador.nomeOrgao": "1ª Vara Cível",
    "grau": "G1"
  },
  "size": 10
}
```

### Consultar processo específico

```javascript
{
  "tribunal": "tjdft",
  "numeroProcesso": "0700001-23.2024.8.07.0001"
}
```

### Estatísticas: Processos por classe

```javascript
{
  "tribunal": "tjrj",
  "aggregations": {
    "por_classe": {
      "terms": {
        "field": "classe.codigo",
        "size": 10
      }
    }
  },
  "filters": {
    "grau": "G2"
  }
}
```

### Estatísticas: Distribuição temporal

```javascript
{
  "tribunal": "tjmg",
  "aggregations": {
    "por_mes": {
      "date_histogram": {
        "field": "dataAjuizamento",
        "calendar_interval": "month"
      }
    }
  }
}
```

## Modelo de Dados

Os processos retornados seguem o [Modelo de Transferência de Dados (MTD)](https://datajud-wiki.cnj.jus.br/mtd/) do Datajud.

### Campos Principais

- `numeroProcesso`: Número único do processo (formato CNJ)
- `classe`: Classe processual (código e nome)
- `sistema`: Sistema de origem (físico/eletrônico)
- `formato`: Formato do processo
- `tribunal`: Código do tribunal
- `dataAjuizamento`: Data de ajuizamento do processo
- `grau`: Grau de jurisdição (G1, G2, G3)
- `orgaoJulgador`: Órgão julgador (código, nome, instância)
- `assuntos`: Array de assuntos processuais
- `movimentos`: Array de movimentações processuais
- `nivelSigilo`: Nível de sigilo (0 a 5)

## Limitações e Considerações

### Rate Limiting

A API Pública do Datajud pode ter limites de taxa. Use paginação e evite fazer muitas requisições simultâneas.

### Sigilo Processual

Processos com sigilo (níveis 1-5) podem ter dados omitidos ou restritos.

### Atualização dos Dados

Os dados são atualizados periodicamente pelos tribunais. A frequência de atualização pode variar.

### Tamanho das Respostas

Para consultas que retornam muitos resultados, use paginação (`size` e `from`) para evitar timeouts.

## Documentação Oficial

- [Datajud Wiki](https://datajud-wiki.cnj.jus.br/)
- [API Pública - Acesso](https://datajud-wiki.cnj.jus.br/api-publica/acesso/)
- [Modelo de Transferência de Dados](https://datajud-wiki.cnj.jus.br/mtd/)
- [Tutorial da API](https://www.cnj.jus.br/wp-content/uploads/2023/05/tutorial-api-publica-datajud-beta.pdf)

## Estrutura do Projeto

```
datajud/
├── server/
│   ├── main.ts                    # Entry point e configuração
│   └── tools/
│       ├── index.ts               # Agregação de ferramentas
│       ├── datajud.ts             # Implementação das ferramentas MCP
│       └── utils/
│           └── datajud.ts         # Cliente HTTP da API
├── shared/
│   └── deco.gen.ts                # Tipos gerados automaticamente
├── package.json
├── tsconfig.json
├── vite.config.ts
├── wrangler.toml
└── README.md
```

## Desenvolvimento

### Gerar Tipos

```bash
npm run gen
```

### Type Check

```bash
npm run check
```

### Build

```bash
npm run build
```

## Suporte

Para questões sobre a API do Datajud, consulte a [Datajud Wiki](https://datajud-wiki.cnj.jus.br/) ou entre em contato com o CNJ.

Para questões sobre este MCP, abra uma issue no repositório.

## Licença

Este projeto segue a mesma licença do repositório principal.
