# Refatoração de Componentes e Adição da Tela de Perfis

## Resumo

Esta refatoração criou uma arquitetura de componentes reutilizáveis baseada em
composição, eliminando código duplicado e melhorando a manutenibilidade do
código. Foi adicionada uma nova tela de "Perfis" para listar perfis digitais
coletados.

## Mudanças Realizadas

### 1. Componentes de Layout Reutilizáveis

Criados componentes base que eliminam a necessidade de repetir código
estrutural:

- **`PageLayout`**: Wrapper padrão com Nav e container
- **`PageHeader`**: Cabeçalho com título, descrição e actions
- **`GridContainer`**: Grid responsivo configurável
- **`EmptyState`**: Estado vazio padrão com ícone e mensagens
- **`LoadingGrid`**: Grid de skeletons para loading states

### 2. Componentes Comuns

Componentes genéricos que funcionam para qualquer tipo de entidade:

- **`FormDialog`**: Dialog wrapper para formulários com validação
- **`EntityCard`**: Card genérico para exibir entidades (pesquisas, perfis,
  etc.)
  - Suporta ícones, títulos, descrições
  - Actions configuráveis
  - Integração com delete dialog
  - Altamente customizável via props

### 3. Reorganização do Servidor

#### Diretórios Consolidados

Movido de estrutura dispersa para organizada:

```
server/tools/
├── digital-content/ (OLD)
├── profiles/ (OLD)
└── content-management/ (NEW)
    ├── content.ts       # Tools de conteúdo digital
    ├── profiles.ts      # Tools de gerenciamento de perfis
    ├── analytics.ts     # Tools de análise de perfis
    └── index.ts         # Exports consolidados
```

#### Novas Tools

**Profile Management Tools:**

- `LIST_DIGITAL_PROFILES`: Lista perfis com filtros opcionais
- `GET_DIGITAL_PROFILE`: Obter perfil por ID
- `DELETE_DIGITAL_PROFILE`: Deletar perfil

### 4. Nova Tela: Perfis

Criada página `/perfis` para gerenciar perfis digitais:

**Funcionalidades:**

- Listagem de perfis coletados
- Filtro por plataforma (Instagram, TikTok, Twitter, etc.)
- Cards informativos com:
  - Avatar da plataforma (emoji)
  - Nome de exibição e username
  - Biografia
  - Contagem de seguidores
  - Links para perfil original
- Ação de delete com confirmação
- Estados de loading e vazio

**Componentes:**

- `ProfileCard`: Card específico para perfis com dados da plataforma
- Hooks: `useProfiles`, `useProfile`, `useDeleteProfile`

### 5. Refatoração da Tela de Pesquisas

A tela de pesquisas foi completamente refatorada para usar os novos componentes:

**Antes:** ~199 linhas com código repetido **Depois:** Componentes reutilizáveis

**Melhorias:**

- Uso de `PageLayout` e `PageHeader`
- `FormDialog` para criação de pesquisas
- `EntityCard` para cards de pesquisas
- `GridContainer` para layout responsivo
- `EmptyState` e `LoadingGrid` para estados

### 6. Navegação Atualizada

Adicionado item "Perfis" na navegação principal:

```tsx
{
  to: "/perfis",
  label: "Perfis",
  icon: User,
}
```

## Benefícios da Refatoração

### 1. DRY (Don't Repeat Yourself)

- Eliminado código duplicado de layouts e estruturas
- Componentes reutilizáveis em vez de copiar/colar

### 2. Composition Pattern

- Componentes pequenos e focados
- Fácil de compor novas páginas
- Flexível e extensível

### 3. Manutenibilidade

- Mudanças em um componente refletem em todas as páginas
- Código mais limpo e legível
- Fácil de testar

### 4. Consistência

- UI uniforme em todas as telas
- Comportamentos padronizados
- Estilos consistentes

### 5. Performance

- Componentes otimizados
- Menor bundle size (reuso de código)
- Better tree-shaking

## Padrões Estabelecidos

### Estrutura de Nova Página

```tsx
function MyPage() {
  const { data, isLoading } = useMyData();
  const deleteMutation = useDeleteData();

  return (
    <PageLayout>
      <PageHeader
        title="Título"
        description="Descrição"
        action={<Button>Action</Button>}
      />

      {isLoading ? <LoadingGrid /> : data?.items.length > 0
        ? (
          <GridContainer>
            {data.items.map((item) => <EntityCard key={item.id} {...item} />)}
          </GridContainer>
        )
        : (
          <EmptyState
            icon={MyIcon}
            title="Nenhum item"
            description="Crie o primeiro"
          />
        )}
    </PageLayout>
  );
}
```

### Estrutura de EntityCard

```tsx
<EntityCard
  icon={IconComponent}
  title="Título"
  description="Descrição opcional"
  footer={<>Informações extras</>}
  actions={[
    {
      icon: ViewIcon,
      label: "Ver",
      variant: "default",
      onClick: () => {},
    },
  ]}
  onDelete={() => handleDelete(id)}
  deleteTitle="Confirmar exclusão?"
  deleteDescription="Esta ação não pode ser desfeita"
/>;
```

## Próximos Passos Sugeridos

1. **Refatorar outras telas** para usar os novos componentes:
   - `/coleta`
   - `/execucoes`
   - Survey detail pages

2. **Criar mais componentes reutilizáveis**:
   - `DataTable` para tabelas
   - `FilterBar` para filtros
   - `StatusBadge` para status

3. **Implementar Zustand stores** para estados complexos:
   - Store de filtros globais
   - Store de preferências do usuário
   - Store de UI state

4. **Adicionar testes**:
   - Unit tests para componentes
   - Integration tests para páginas
   - E2E tests para fluxos principais

## Arquivos Criados

### Componentes

- `view/src/components/layout/PageLayout.tsx`
- `view/src/components/layout/PageHeader.tsx`
- `view/src/components/layout/GridContainer.tsx`
- `view/src/components/layout/EmptyState.tsx`
- `view/src/components/layout/LoadingGrid.tsx`
- `view/src/components/common/FormDialog.tsx`
- `view/src/components/common/EntityCard.tsx`
- `view/src/components/profiles/ProfileCard.tsx`

### Hooks

- `view/src/hooks/useProfiles.ts`

### Routes

- `view/src/routes/perfis.tsx`

### Server Tools

- `server/tools/content-management/profiles.ts`
- `server/tools/content-management/content.ts` (moved)
- `server/tools/content-management/analytics.ts` (moved)
- `server/tools/content-management/index.ts`

## Arquivos Modificados

- `view/src/routes/pesquisas.tsx` (refatorado)
- `view/src/components/nav.tsx` (adicionado item Perfis)
- `view/src/main.tsx` (adicionada rota de perfis)
- `server/tools/index.ts` (atualizado imports)

## Arquivos Deletados

- `server/tools/digital-content/` (movido para content-management)
- `server/tools/profiles/` (movido para content-management)

## Conclusão

Esta refatoração estabelece uma base sólida para o crescimento futuro da
aplicação, tornando extremamente fácil adicionar novas funcionalidades mantendo
consistência e qualidade de código. O padrão de composição permite criar novas
telas rapidamente, reutilizando componentes existentes e mantendo a
manutenibilidade alta.
