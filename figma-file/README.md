# figma-file

MCP App que lê arquivos do Figma a partir de um export `.fig`, não da API. Funciona com qualquer
assento (inclusive View) e não tem rate limit. Evolução da POC
[decocms/figma-local-mcp](https://github.com/decocms/figma-local-mcp).

## Como funciona

1. `figma_import` abre uma UI que ensina a exportar (Figma → **Arquivo → Salvar cópia local…**, no
   navegador ou no desktop) e recebe o `.fig`.
2. O `.fig` é um zip onde ~95% são `images/`. A UI lê só o diretório central do zip (`Blob.slice`) e
   extrai o `canvas.fig` (o documento, ~12 MB num arquivo de 700 MB). As imagens não saem da máquina.
3. O documento sobe em pedaços de 2 MB via `figma_upload_chunk` e o `figma_register` junta, confere
   o sha256, faz o parse e salva em `figma-file/<id>/` no object storage conectado.
4. As tools de leitura (`figma_list_files`, `figma_get_pages`, `figma_get_node`, `figma_search`,
   `figma_get_texts`, `figma_get_styles`, `figma_delete_file`) carregam o documento sob demanda
   com cache LRU em memória.

O upload passa pelas tools (e não por PUT direto do iframe pro bucket) para não depender de CSP
`connectDomains` no host.

## Formato

`canvas.fig` = `"fig-kiwi"` + `u32` versão + chunks `[u32 len, bytes]`: chunk 0 é o schema
[kiwi](https://github.com/evanw/kiwi) comprimido, chunk 1 a mensagem `NODE_CHANGES` (deflate raw ou
zstd). Ver `api/lib/fig.ts`.

Memória: os campos de render (`derivedTextData`, `derivedSymbolData`, geometria) são descartados e
as propriedades de cada nó ficam como string JSON. Um arquivo de 60k nós retém ~150 MB; o parse
tem pico de ~1,4 GB de RSS.

## Desenvolvimento

```bash
bun install
bun test        # parser + extração do zip
bun run dev     # API em :3001/api/mcp + build da UI em watch
bun run start   # tunnel público *.deco.host/api/mcp para testar no Studio
```

Precisa de `AUTH_TOKEN` no `.env` (o `scripts/new.ts` gera) e, no Studio, de uma conexão
`@deco/object-storage` no binding `OBJECT_STORAGE`.

## Limitações

- Snapshot do momento do export: mudou no Figma, reimporta.
- Sem comentários (use o MCP `figma`) e sem download de imagens por enquanto.
