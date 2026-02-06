# Google Apps Script MCP

MCP Server para integração com a API do Google Apps Script. Permite gerenciar projetos, executar scripts, controlar versões e deployments, e monitorar execuções programaticamente.

## Funcionalidades

### 🗂️ Projects (5 ferramentas)

| Ferramenta | Descrição |
|------------|-----------|
| `create_project` | Cria um novo projeto Apps Script vazio |
| `get_project` | Obtém metadados de um projeto (título, criador, timestamps) |
| `get_project_content` | Obtém o conteúdo do projeto (arquivos e código fonte) |
| `update_project_content` | Atualiza os arquivos do projeto |
| `get_project_metrics` | Obtém métricas de uso (usuários ativos, execuções, falhas) |

### ⚡ Scripts - Execução (2 ferramentas)

| Ferramenta | Descrição |
|------------|-----------|
| `run_script` | Executa uma função do script (requer deployment como API executable) |
| `run_script_dev_mode` | Executa em modo desenvolvimento (usa código mais recente, só para owners) |

### 📦 Versions (3 ferramentas)

| Ferramenta | Descrição |
|------------|-----------|
| `create_version` | Cria uma nova versão imutável do código atual |
| `get_version` | Obtém detalhes de uma versão específica |
| `list_versions` | Lista todas as versões de um projeto |

### 🚀 Deployments (5 ferramentas)

| Ferramenta | Descrição |
|------------|-----------|
| `create_deployment` | Cria um deployment (web app, API executable, ou add-on) |
| `get_deployment` | Obtém detalhes de um deployment específico |
| `list_deployments` | Lista todos os deployments de um projeto |
| `update_deployment` | Atualiza um deployment existente |
| `delete_deployment` | Remove um deployment |

### 📊 Processes - Monitoramento (3 ferramentas)

| Ferramenta | Descrição |
|------------|-----------|
| `list_user_processes` | Lista execuções do usuário em todos os scripts |
| `list_script_processes` | Lista execuções de um script específico |
| `get_running_processes` | Obtém processos em execução no momento |

## Autenticação

Este MCP utiliza OAuth 2.0 com os seguintes escopos:

```
https://www.googleapis.com/auth/script.projects
https://www.googleapis.com/auth/script.projects.readonly
https://www.googleapis.com/auth/script.deployments
https://www.googleapis.com/auth/script.deployments.readonly
https://www.googleapis.com/auth/script.metrics
https://www.googleapis.com/auth/script.processes
```

## Exemplos de Uso

### Criar um projeto e adicionar código

```javascript
// 1. Criar projeto
const project = await create_project({ title: "Meu Script" });

// 2. Adicionar código
await update_project_content({
  scriptId: project.scriptId,
  files: [
    {
      name: "Code",
      type: "SERVER_JS",
      source: `
function myFunction() {
  Logger.log('Hello World!');
  return 'Success';
}
      `
    },
    {
      name: "appsscript",
      type: "JSON",
      source: JSON.stringify({
        timeZone: "America/Sao_Paulo",
        exceptionLogging: "STACKDRIVER"
      })
    }
  ]
});
```

### Criar versão e deployment

```javascript
// 1. Criar versão
const version = await create_version({
  scriptId: "SCRIPT_ID",
  description: "v1.0 - Release inicial"
});

// 2. Criar deployment
const deployment = await create_deployment({
  scriptId: "SCRIPT_ID",
  versionNumber: version.versionNumber,
  description: "Produção"
});
```

### Executar função remotamente

```javascript
// Executar função (requer deployment como API executable)
const result = await run_script({
  scriptId: "SCRIPT_ID",
  functionName: "myFunction",
  parameters: ["arg1", "arg2"]
});

console.log(result.result);
```

### Monitorar execuções

```javascript
// Listar processos em execução
const running = await get_running_processes({});
console.log(`${running.runningCount} processos em execução`);

// Listar processos de um script específico
const processes = await list_script_processes({
  scriptId: "SCRIPT_ID",
  statuses: ["COMPLETED", "FAILED"]
});
```

## Tipos de Arquivo

| Tipo | Extensão | Descrição |
|------|----------|-----------|
| `SERVER_JS` | `.gs` | Código Google Apps Script (JavaScript) |
| `HTML` | `.html` | Arquivos HTML para interfaces |
| `JSON` | `.json` | Manifesto do projeto (`appsscript.json`) |

## Status de Processo

| Status | Descrição |
|--------|-----------|
| `RUNNING` | Em execução |
| `COMPLETED` | Concluído com sucesso |
| `FAILED` | Falhou com erro |
| `TIMED_OUT` | Excedeu tempo limite |
| `CANCELED` | Cancelado |
| `PAUSED` | Pausado |

## Tipos de Processo

| Tipo | Descrição |
|------|-----------|
| `WEBAPP` | Execução de web app |
| `EXECUTION_API` | Execução via API |
| `TIME_DRIVEN` | Trigger baseado em tempo |
| `TRIGGER` | Trigger de evento |
| `ADD_ON` | Execução de add-on |
| `EDITOR` | Execução do editor |

## Limitações da API

- Scripts precisam estar publicados como API executable para uso com `run_script`
- O modo desenvolvimento (`run_script_dev_mode`) só funciona para owners do script
- Métricas podem ter delay de até 24 horas
- Limites de quota da API do Google se aplicam

## Links Úteis

- [Google Apps Script API Reference](https://developers.google.com/apps-script/api/reference/rest)
- [Quotas e Limites](https://developers.google.com/apps-script/guides/services/quotas)
- [Executar Scripts via API](https://developers.google.com/apps-script/api/how-tos/execute)



