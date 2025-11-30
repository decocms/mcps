# Zustand - Referência Rápida

> Guia de consulta rápida para desenvolvimento com Zustand

## 🚀 Quick Start

### Template de Store Completo

```typescript
import { create } from "zustand";

// 1. Interface do State
export interface MyFilters {
  search: string;
  category?: string;
}

// 2. Interface completa
interface MyFiltersState extends MyFilters {
  actions: {
    setSearch: (search: string) => void;
    setCategory: (category: string | undefined) => void;
    reset: () => void;
  };
}

// 3. Defaults
const defaultFilters: MyFilters = {
  search: "",
  category: undefined,
};

// 4. Store (NÃO EXPORTAR)
const useMyFiltersStore = create<MyFiltersState>()((set) => ({
  ...defaultFilters,

  actions: {
    setSearch: (search) => set({ search }),
    setCategory: (category) => set({ category }),
    reset: () => set(defaultFilters),
  },
}));

// 5. Hooks (EXPORTAR APENAS ESTES)
export const useMyActions = () => useMyFiltersStore((state) => state.actions);
export const useSearch = () => useMyFiltersStore((state) => state.search);
export const useCategory = () => useMyFiltersStore((state) => state.category);
export const useMyFilters = (): MyFilters => ({
  search: useSearch(),
  category: useCategory(),
});
```

---

## ✅ Checklist Rápido

### Ao Criar Store

- [ ] `create<Type>()((set, get) => ...)` - com currying `()`
- [ ] Store NÃO exportado
- [ ] Actions em namespace `actions: { }`
- [ ] Defaults em constante separada
- [ ] Hooks atômicos exportados
- [ ] Hook de actions exportado

### Ao Usar em Componente

- [ ] Importar hooks específicos, não o store
- [ ] Um hook por valor necessário
- [ ] Hook de actions para modificar state
- [ ] NUNCA `const store = useStore()`

---

## 📋 Padrões Comuns

### Store de Filtros

```typescript
const useFiltersStore = create<FiltersState>()((set, get) => ({
  value1: undefined,
  value2: undefined,

  actions: {
    setValue1: (value1) => set({ value1 }),
    setValue2: (value2) => set({ value2 }),
    reset: () => set(defaults),
    hasActiveFilters: () => {
      const state = get();
      return !!(state.value1 || state.value2);
    },
  },
}));
```

### Store de UI State (Modal, Sidebar, etc)

```typescript
const useUIStore = create<UIState>()((set) => ({
  isOpen: false,

  actions: {
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
    toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  },
}));
```

### Store com Computed Values

```typescript
// No store: apenas dados
const useCountStore = create<CountState>()((set) => ({
  count: 0,
  actions: { increment: () => set((s) => ({ count: s.count + 1 })) },
}));

// Computed como hook separado
export const useIsEven = () => {
  const count = useCount();
  return count % 2 === 0;
};
```

---

## 🎨 Uso em Componentes

### Padrão Básico

```typescript
function MyComponent() {
  // 1. Selectors atômicos
  const search = useSearch();
  const category = useCategory();

  // 2. Actions
  const { setSearch, setCategory } = useMyActions();

  // 3. Usar normalmente
  return (
    <input
      value={search}
      onChange={(e) => setSearch(e.target.value)}
    />
  );
}
```

### Com TanStack Query

```typescript
function MyComponent() {
  // Filters do Zustand
  const filters = useMyFilters();

  // Query que depende dos filters
  const { data } = useQuery({
    queryKey: ["items", filters],
    queryFn: () => fetchItems(filters),
  });

  return <div>{/* ... */}</div>;
}
```

### Com Formulários

```typescript
function FilterForm() {
  const search = useSearch();
  const category = useCategory();
  const { setSearch, setCategory, reset } = useMyActions();

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <select
        value={category || ""}
        onChange={(e) => setCategory(e.target.value || undefined)}
      >
        <option value="">All</option>
        <option value="a">Category A</option>
      </select>
      <button type="button" onClick={reset}>
        Clear
      </button>
    </form>
  );
}
```

---

## ❌ Anti-Padrões Comuns

### 1. Exportar Store Diretamente

```typescript
// ❌ NUNCA
export const useMyStore = create(...)

// ✅ SEMPRE
const useMyStore = create(...)
export const useValue = () => useMyStore(...)
```

### 2. Subscrever Store Inteiro

```typescript
// ❌ NUNCA
const store = useMyStore();
return <div>{store.value}</div>;

// ✅ SEMPRE
const value = useValue();
return <div>{value}</div>;
```

### 3. Selector que Retorna Objeto Novo

```typescript
// ❌ NUNCA (causa re-render sempre)
const data = useStore((s) => ({ a: s.a, b: s.b }));

// ✅ SEMPRE (selectors atômicos)
const a = useA();
const b = useB();
```

### 4. Misturar Actions com State

```typescript
// ❌ NUNCA
interface State {
  value: string;
  setValue: (v: string) => void; // No mesmo nível!
}

// ✅ SEMPRE
interface State {
  value: string;
  actions: {
    setValue: (v: string) => void; // Em namespace
  };
}
```

---

## 🔧 Snippets Úteis

### Snippet: Atomic Selector

```typescript
export const useXxx = () => useMyStore((state) => state.xxx);
```

### Snippet: Actions Hook

```typescript
export const useMyActions = () => useMyStore((state) => state.actions);
```

### Snippet: Computed Hook

```typescript
export const useComputed = () => {
  const value1 = useValue1();
  const value2 = useValue2();
  return someComputation(value1, value2);
};
```

### Snippet: Helper Hook (com lógica)

```typescript
export const useHasActive = () =>
  useMyStore((state) => !!(state.a || state.b || state.c));
```

---

## 🐛 Debug

### Verificar Re-renders

```typescript
export const useValue = () => {
  const value = useMyStore((state) => state.value);
  console.log("useValue render:", value); // Remove em produção
  return value;
};
```

### Verificar Estado Atual

```typescript
// No DevTools console
useMyStore.getState();
```

### Verificar Subscribers

```typescript
// No DevTools console
useMyStore.subscribe((state) => console.log("State changed:", state));
```

---

## 🎯 Performance Tips

1. **Sempre use selectors atômicos**
   - Um hook por valor primitivo
   - Componente só re-renderiza quando o valor específico muda

2. **Actions em namespace separado**
   - Actions não mudam, safe para subscrever todas
   - `const actions = useMyActions()` é eficiente

3. **Computed values como hooks**
   - Não calcule no render, use hooks computed
   - Permite memoização e otimização

4. **Use shallow comparison quando necessário**
   ```typescript
   import { shallow } from "zustand/shallow";
   const data = useStore(
     (s) => ({ a: s.a, b: s.b }),
     shallow,
   );
   ```

---

## 📚 Links Rápidos

- [Documentação Completa](./ZUSTAND_BEST_PRACTICES.md)
- [Zustand Docs](https://docs.pmnd.rs/zustand)
- [TypeScript Guide](https://docs.pmnd.rs/zustand/guides/typescript)

---

## 🔄 Última Atualização

**Data:** Novembro 2025\
**Versão Zustand:** 4.x

---

## 💡 Dica Final

> "Se você está pensando em exportar o store diretamente, PARE! Crie um hook
> atômico específico para o que você precisa."

**Lembre-se:** Performance no Zustand vem de selectors atômicos. Um componente
deve subscrever apenas nos valores que realmente usa.
