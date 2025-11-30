# Guia de Boas Práticas: Zustand no Frontend

> Documentação criada após refatoração completa do `contentFiltersStore`
> seguindo as melhores práticas oficiais do Zustand.

## 📚 Índice

1. [Visão Geral](#visão-geral)
2. [Problemas Comuns](#problemas-comuns)
3. [Padrões Corretos](#padrões-corretos)
4. [Estrutura de um Store](#estrutura-de-um-store)
5. [Exportação de Hooks](#exportação-de-hooks)
6. [Uso em Componentes](#uso-em-componentes)
7. [Performance e Re-renders](#performance-e-re-renders)
8. [Checklist de Implementação](#checklist-de-implementação)
9. [Exemplos Práticos](#exemplos-práticos)
10. [Referências](#referências)

---

## 🎯 Visão Geral

Zustand é uma biblioteca de gerenciamento de estado minimalista e não opinativa.
Porém, para aproveitar ao máximo seus benefícios de performance e evitar
re-renders desnecessários, é crucial seguir algumas práticas recomendadas.

### Princípios Fundamentais

1. **Não exporte o store diretamente** - Apenas custom hooks
2. **Use selectors atômicos** - Um hook por propriedade
3. **Separe state de actions** - Actions em namespace próprio
4. **Use TypeScript curried syntax** - `create<Type>()(...)` para inferência
   correta

---

## ❌ Problemas Comuns

### 1. Exportar o Store Diretamente

```typescript
// ❌ ERRADO
export const useContentFiltersStore = create<ContentFiltersState>((set) => ({
  sourcePlatform: undefined,
  setSourcePlatform: (platform) => set({ sourcePlatform: platform }),
}));

// No componente
const filters = useContentFiltersStore(); // Subscreve no store inteiro!
```

**Problema:** O componente re-renderiza quando QUALQUER parte do store muda,
mesmo que só use `sourcePlatform`.

### 2. TypeScript sem Currying

```typescript
// ❌ ERRADO
export const useStore = create<State>((set) => ({
  // A inferência de tipos não funciona corretamente
}));
```

### 3. Não Separar Actions de State

```typescript
// ❌ ERRADO - Actions misturadas com state
interface State {
  count: number;
  increment: () => void; // Action no mesmo nível do state
}
```

### 4. Selectors Não-Atômicos

```typescript
// ❌ ERRADO - Retorna objeto novo toda vez
const { bears, fish } = useStore((state) => ({
  bears: state.bears,
  fish: state.fish,
}));
// Isso causa re-render mesmo se bears/fish não mudaram!
```

---

## ✅ Padrões Corretos

### 1. Store Interno, Hooks Exportados

```typescript
// ✅ CORRETO
const useContentFiltersStore = create<ContentFiltersState>()((set) => ({
  // Store não exportado
}));

// Exportar apenas hooks customizados
export const useSourcePlatform = () =>
  useContentFiltersStore((state) => state.sourcePlatform);
```

### 2. TypeScript com Currying

```typescript
// ✅ CORRETO
const useStore = create<State>()((set, get) => ({
  // Inferência de tipos funciona perfeitamente
}));
```

### 3. Actions em Namespace Separado

```typescript
// ✅ CORRETO
interface State {
  count: number;
  actions: {
    increment: () => void;
    decrement: () => void;
  };
}
```

### 4. Selectors Atômicos

```typescript
// ✅ CORRETO
const bears = useBears(); // Selector atômico
const fish = useFish(); // Selector atômico
```

---

## 🏗️ Estrutura de um Store

### Template Completo

```typescript
/**
 * Nome do Store
 * Descrição do que ele gerencia
 */
import { create } from "zustand";

// 1. Interface do State (apenas dados)
export interface MyState {
  value1: string;
  value2: number;
  value3?: boolean;
}

// 2. Interface completa (state + actions)
interface MyStoreState extends MyState {
  actions: {
    setValue1: (value: string) => void;
    setValue2: (value: number) => void;
    setValue3: (value: boolean | undefined) => void;
    reset: () => void;
  };
}

// 3. Valores padrão
const defaultState: MyState = {
  value1: "",
  value2: 0,
  value3: undefined,
};

// 4. Store (NÃO EXPORTADO)
const useMyStore = create<MyStoreState>()((set, get) => ({
  ...defaultState,

  actions: {
    setValue1: (value1) => set({ value1 }),
    setValue2: (value2) => set({ value2 }),
    setValue3: (value3) => set({ value3 }),
    reset: () => set(defaultState),
  },
}));

// 5. Hooks exportados (APENAS ESTES SÃO EXPORTADOS)

// Actions hook
export const useMyActions = () => useMyStore((state) => state.actions);

// State selectors (atômicos)
export const useValue1 = () => useMyStore((state) => state.value1);
export const useValue2 = () => useMyStore((state) => state.value2);
export const useValue3 = () => useMyStore((state) => state.value3);

// Computed/Helper hooks
export const useMyCompleteState = (): MyState => {
  const value1 = useValue1();
  const value2 = useValue2();
  const value3 = useValue3();

  return { value1, value2, value3 };
};
```

---

## 📤 Exportação de Hooks

### Regras de Ouro

1. **NUNCA exporte o store diretamente**
2. **SEMPRE exporte custom hooks**
3. **Um hook por propriedade do state** (selectors atômicos)
4. **Um hook para todas as actions** (actions não mudam)

### Tipos de Hooks para Exportar

#### 1. Actions Hook

```typescript
// Actions nunca mudam, então é seguro retornar todas
export const useMyActions = () => useMyStore((state) => state.actions);
```

#### 2. Atomic State Selectors

```typescript
// Um hook por propriedade
export const useSourcePlatform = () =>
  useMyStore((state) => state.sourcePlatform);

export const useContentType = () => useMyStore((state) => state.contentType);
```

#### 3. Computed/Derived Hooks

```typescript
// Hook que combina múltiplos valores
export const useCompleteFilters = (): Filters => {
  const sourcePlatform = useSourcePlatform();
  const contentType = useContentType();
  const search = useSearch();

  return { sourcePlatform, contentType, search };
};
```

#### 4. Helper Hooks

```typescript
// Hook que executa lógica baseada no state
export const useHasActiveFilters = () => {
  return useMyStore((state) => {
    return !!(
      state.sourcePlatform ||
      state.contentType ||
      state.search
    );
  });
};
```

---

## 🎨 Uso em Componentes

### Padrão Recomendado

```typescript
import {
  useContentType,
  useMyActions,
  useSourcePlatform,
} from "@/stores/myStore";

function MyComponent() {
  // 1. Importar selectors atômicos
  const sourcePlatform = useSourcePlatform();
  const contentType = useContentType();

  // 2. Importar actions
  const actions = useMyActions();

  // 3. Usar normalmente
  return (
    <div>
      <p>Platform: {sourcePlatform}</p>
      <button onClick={() => actions.setSourcePlatform("instagram")}>
        Set Platform
      </button>
    </div>
  );
}
```

### ❌ Anti-padrões

```typescript
// ❌ NUNCA faça isso
function BadComponent() {
  // Subscreve no store inteiro!
  const store = useMyStore();

  return <div>{store.sourcePlatform}</div>;
}

// ❌ NUNCA faça isso
function BadComponent2() {
  // Cria objeto novo toda vez, causa re-render
  const { sourcePlatform, contentType } = useMyStore((state) => ({
    sourcePlatform: state.sourcePlatform,
    contentType: state.contentType,
  }));

  return <div>{sourcePlatform}</div>;
}
```

---

## ⚡ Performance e Re-renders

### Como Zustand Detecta Mudanças

Zustand usa `Object.is()` para comparar o resultado do selector:

```typescript
// Se o resultado do selector mudar (Object.is), o componente re-renderiza
const value = useStore((state) => state.value);
```

### Por que Selectors Atômicos São Importantes

```typescript
// ❌ PROBLEMA: Retorna novo objeto toda vez
const data = useStore((state) => ({
  bears: state.bears,
  fish: state.fish,
}));
// Object.is({...}, {...}) sempre retorna false!

// ✅ SOLUÇÃO: Selectors atômicos
const bears = useBears(); // Só re-renderiza se bears mudar
const fish = useFish(); // Só re-renderiza se fish mudar
```

### Medindo Performance

Use React DevTools Profiler para verificar:

1. Quantas vezes o componente renderiza
2. Por que ele renderiza
3. Se os re-renders são necessários

```typescript
// Adicione console.log para debug (remova em produção)
export const useSourcePlatform = () => {
  const value = useMyStore((state) => state.sourcePlatform);
  console.log("useSourcePlatform called:", value);
  return value;
};
```

---

## ✅ Checklist de Implementação

Use este checklist ao criar ou revisar um store Zustand:

### Estrutura

- [ ] Store usa syntax curried: `create<Type>()()`
- [ ] Store NÃO é exportado
- [ ] State e Actions estão separados
- [ ] Actions estão em namespace `actions`
- [ ] Valores default definidos em constante separada
- [ ] Action `reset()` implementada usando valores default

### TypeScript

- [ ] Interface do State exportada (para tipos de API, etc)
- [ ] Interface completa com actions definida
- [ ] Todos os tipos estão corretos e inferidos

### Hooks Exportados

- [ ] Hook de actions exportado: `useXxxActions()`
- [ ] Um hook por propriedade do state: `useXxxValue()`
- [ ] Hooks computed/helper quando necessário
- [ ] NENHUM hook retorna objetos novos (exceto computed hooks)

### Documentação

- [ ] JSDoc com descrição do store
- [ ] Comentários explicando lógica complexa
- [ ] Exemplos de uso se necessário

### Performance

- [ ] Selectors são atômicos (retornam valores primitivos)
- [ ] Não há selectors que retornam arrays/objects novos
- [ ] Actions não fazem cálculos pesados síncronos

---

## 💡 Exemplos Práticos

### Exemplo 1: Filtros de Busca

```typescript
// stores/searchFiltersStore.ts
import { create } from "zustand";

export interface SearchFilters {
  query: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
}

interface SearchFiltersState extends SearchFilters {
  actions: {
    setQuery: (query: string) => void;
    setCategory: (category: string | undefined) => void;
    setMinPrice: (price: number | undefined) => void;
    setMaxPrice: (price: number | undefined) => void;
    reset: () => void;
    hasActiveFilters: () => boolean;
  };
}

const defaultFilters: SearchFilters = {
  query: "",
  category: undefined,
  minPrice: undefined,
  maxPrice: undefined,
};

const useSearchFiltersStore = create<SearchFiltersState>()((set, get) => ({
  ...defaultFilters,

  actions: {
    setQuery: (query) => set({ query }),
    setCategory: (category) => set({ category }),
    setMinPrice: (minPrice) => set({ minPrice }),
    setMaxPrice: (maxPrice) => set({ maxPrice }),
    reset: () => set(defaultFilters),

    hasActiveFilters: () => {
      const state = get();
      return !!(
        state.query ||
        state.category ||
        state.minPrice !== undefined ||
        state.maxPrice !== undefined
      );
    },
  },
}));

// Exports
export const useSearchActions = () =>
  useSearchFiltersStore((state) => state.actions);

export const useSearchQuery = () =>
  useSearchFiltersStore((state) => state.query);

export const useSearchCategory = () =>
  useSearchFiltersStore((state) => state.category);

export const useMinPrice = () =>
  useSearchFiltersStore((state) => state.minPrice);

export const useMaxPrice = () =>
  useSearchFiltersStore((state) => state.maxPrice);

export const useSearchFilters = (): SearchFilters => {
  const query = useSearchQuery();
  const category = useSearchCategory();
  const minPrice = useMinPrice();
  const maxPrice = useMaxPrice();

  return { query, category, minPrice, maxPrice };
};

export const useHasActiveSearchFilters = () =>
  useSearchFiltersStore((state) => state.actions.hasActiveFilters());
```

### Exemplo 2: Modal State

```typescript
// stores/modalStore.ts
import { create } from "zustand";

interface ModalState {
  isOpen: boolean;
  title: string;
  content: React.ReactNode | null;
  actions: {
    open: (title: string, content: React.ReactNode) => void;
    close: () => void;
  };
}

const useModalStore = create<ModalState>()((set) => ({
  isOpen: false,
  title: "",
  content: null,

  actions: {
    open: (title, content) => set({ isOpen: true, title, content }),
    close: () => set({ isOpen: false, title: "", content: null }),
  },
}));

// Exports
export const useModalActions = () => useModalStore((state) => state.actions);
export const useIsModalOpen = () => useModalStore((state) => state.isOpen);
export const useModalTitle = () => useModalStore((state) => state.title);
export const useModalContent = () => useModalStore((state) => state.content);
```

### Exemplo 3: Paginação

```typescript
// stores/paginationStore.ts
import { create } from "zustand";

interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
  actions: {
    setPage: (page: number) => void;
    setPageSize: (pageSize: number) => void;
    setTotal: (total: number) => void;
    nextPage: () => void;
    prevPage: () => void;
    reset: () => void;
  };
}

const defaultState = {
  page: 1,
  pageSize: 20,
  total: 0,
};

const usePaginationStore = create<PaginationState>()((set, get) => ({
  ...defaultState,

  actions: {
    setPage: (page) => set({ page }),
    setPageSize: (pageSize) => set({ pageSize, page: 1 }),
    setTotal: (total) => set({ total }),

    nextPage: () => {
      const { page, pageSize, total } = get();
      const maxPage = Math.ceil(total / pageSize);
      if (page < maxPage) {
        set({ page: page + 1 });
      }
    },

    prevPage: () => {
      const { page } = get();
      if (page > 1) {
        set({ page: page - 1 });
      }
    },

    reset: () => set(defaultState),
  },
}));

// Exports
export const usePaginationActions = () =>
  usePaginationStore((state) => state.actions);

export const usePage = () => usePaginationStore((state) => state.page);
export const usePageSize = () => usePaginationStore((state) => state.pageSize);
export const useTotal = () => usePaginationStore((state) => state.total);

export const useTotalPages = () =>
  usePaginationStore((state) => Math.ceil(state.total / state.pageSize));

export const useHasNextPage = () =>
  usePaginationStore((state) => {
    const maxPage = Math.ceil(state.total / state.pageSize);
    return state.page < maxPage;
  });

export const useHasPrevPage = () =>
  usePaginationStore((state) => state.page > 1);
```

---

## 🚀 Migrando Store Existente

### Passo a Passo

1. **Adicione currying ao `create`:**
   ```typescript
   // Antes
   create<State>((set) => ...)

   // Depois
   create<State>()((set) => ...)
   ```

2. **Mova actions para namespace:**
   ```typescript
   // Antes
   interface State {
     value: string;
     setValue: (v: string) => void;
   }

   // Depois
   interface State {
     value: string;
     actions: {
       setValue: (v: string) => void;
     };
   }
   ```

3. **Remova export do store:**
   ```typescript
   // Antes
   export const useMyStore = create...

   // Depois
   const useMyStore = create...
   ```

4. **Crie hooks atômicos:**
   ```typescript
   export const useValue = () => useMyStore((state) => state.value);
   export const useMyActions = () => useMyStore((state) => state.actions);
   ```

5. **Atualize componentes:**
   ```typescript
   // Antes
   const store = useMyStore();
   store.setValue("foo");

   // Depois
   const value = useValue();
   const { setValue } = useMyActions();
   setValue("foo");
   ```

---

## 🔍 Troubleshooting

### Problema: Componente re-renderiza muito

**Causa:** Provavelmente usando selector não-atômico que retorna objeto/array
novo.

**Solução:** Use selectors atômicos ou shallow comparison.

```typescript
// Se realmente precisa de múltiplos valores, use shallow
import { shallow } from "zustand/shallow";

const { value1, value2 } = useStore(
  (state) => ({ value1: state.value1, value2: state.value2 }),
  shallow,
);
```

### Problema: TypeScript não infere tipos corretamente

**Causa:** Não está usando syntax curried.

**Solução:** Adicione `()` extra:

```typescript
// Errado
create<State>((set) => ...)

// Correto
create<State>()((set) => ...)
```

### Problema: Actions parecem não funcionar

**Causa:** Pode estar chamando action sem `()` ou usando action de forma
imutável.

**Solução:** Verifique:

```typescript
// Errado
actions.setValue; // Retorna a função, não executa

// Correto
actions.setValue("foo"); // Executa a função
```

---

## 📖 Referências

- [Zustand Official Docs](https://docs.pmnd.rs/zustand)
- [TypeScript Guide](https://docs.pmnd.rs/zustand/guides/typescript)
- [Prevent Rerenders with useShallow](https://docs.pmnd.rs/zustand/guides/prevent-rerenders-with-use-shallow)
- [TkDodo's Blog - Working with Zustand](https://tkdodo.eu/blog/working-with-zustand)
- [Flux Inspired Practices](https://docs.pmnd.rs/zustand/guides/flux-inspired-practice)

---

## 📝 Contribuindo com este Guia

Este guia foi criado após refatoração do `contentFiltersStore`. Se encontrar
novos padrões ou anti-padrões, adicione-os aqui para beneficiar toda a equipe.

### Como Contribuir

1. Adicione exemplos práticos que encontrou
2. Documente problemas de performance e soluções
3. Compartilhe truques e otimizações
4. Mantenha os exemplos atualizados com a versão do Zustand

---

**Última atualização:** Novembro 2025\
**Versão do Zustand:** 4.x\
**Autor:** Refatoração baseada em documentação oficial do Zustand
