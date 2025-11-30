# Composition Pattern in React: A Modern Approach

## Table of Contents

- [Introduction](#introduction)
- [What is the Composition Pattern?](#what-is-the-composition-pattern)
- [Why Composition Over Inheritance?](#why-composition-over-inheritance)
- [Core Composition Techniques](#core-composition-techniques)
  - [Children Prop Pattern](#children-prop-pattern)
  - [Props as Components Pattern](#props-as-components-pattern)
  - [Slot Pattern](#slot-pattern)
- [Best Practices: Stateless Components with Custom Hooks](#best-practices-stateless-components-with-custom-hooks)
- [Real-World Examples](#real-world-examples)
- [Advanced Patterns](#advanced-patterns)
- [Testing Composed Components](#testing-composed-components)
- [Common Pitfalls and Solutions](#common-pitfalls-and-solutions)
- [Conclusion](#conclusion)

---

## Introduction

The Composition Pattern is one of the fundamental design principles in React.
Instead of using inheritance to share code between components, React encourages
composition - combining smaller, reusable components to build complex user
interfaces.

This guide demonstrates how to implement composition patterns while following
modern best practices:

- **Stateless components**: Components don't manage state directly
- **Custom hooks**: All state management and logic lives in reusable hooks
- **Separation of concerns**: Clear boundaries between UI and business logic
- **Testability**: Isolated, testable units

## What is the Composition Pattern?

Composition is the practice of building complex components by combining simpler
ones. Think of it like LEGO blocks - you create complex structures by snapping
together smaller pieces, rather than carving a single, monolithic block.

### Simple Example

```tsx
// ❌ Inheritance approach (not recommended in React)
class BaseButton extends React.Component {
  // shared functionality
}

class PrimaryButton extends BaseButton {
  // specific implementation
}

// ✅ Composition approach (React way)
function Button({ children, variant = "default" }) {
  return (
    <button className={`btn btn-${variant}`}>
      {children}
    </button>
  );
}

function PrimaryButton({ children }) {
  return <Button variant="primary">{children}</Button>;
}
```

## Why Composition Over Inheritance?

### 1. Flexibility

Composition allows you to mix and match components freely without being locked
into a rigid class hierarchy.

### 2. Reusability

Small, focused components can be reused in many different contexts.

### 3. Maintainability

Changes to one component don't cascade through an inheritance chain.

### 4. Better TypeScript Support

Composition works naturally with TypeScript's type system, while inheritance can
lead to complex type hierarchies.

### 5. Easier Testing

Composed components are easier to test in isolation because they have clear
boundaries and dependencies.

## Core Composition Techniques

### Children Prop Pattern

The `children` prop is React's primary mechanism for composition. It allows a
component to receive and render arbitrary content.

```tsx
interface CardProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Card container component
 *
 * Pure presentational component with no state.
 * Accepts any children and renders them.
 */
function Card({ children, className = "" }: CardProps) {
  return (
    <div className={`card ${className}`}>
      {children}
    </div>
  );
}

// Usage - compose different content
function ProfileCard() {
  return (
    <Card>
      <h2>John Doe</h2>
      <p>Software Engineer</p>
      <button>Follow</button>
    </Card>
  );
}

function ArticleCard() {
  return (
    <Card>
      <h3>Understanding React Composition</h3>
      <p>A comprehensive guide...</p>
      <span>5 min read</span>
    </Card>
  );
}
```

### Props as Components Pattern

Instead of passing data, pass entire components as props. This gives maximum
flexibility.

```tsx
interface LayoutProps {
  header: React.ReactNode;
  sidebar: React.ReactNode;
  content: React.ReactNode;
  footer: React.ReactNode;
}

/**
 * Layout component using composition
 *
 * Stateless - receives composed sections as props
 */
function Layout({ header, sidebar, content, footer }: LayoutProps) {
  return (
    <div className="layout">
      <header className="layout-header">{header}</header>
      <div className="layout-main">
        <aside className="layout-sidebar">{sidebar}</aside>
        <main className="layout-content">{content}</main>
      </div>
      <footer className="layout-footer">{footer}</footer>
    </div>
  );
}

// Usage - compose different sections
function DashboardPage() {
  return (
    <Layout
      header={<DashboardHeader />}
      sidebar={<DashboardNav />}
      content={<DashboardContent />}
      footer={<DashboardFooter />}
    />
  );
}
```

### Slot Pattern

The slot pattern provides named "slots" for content, giving structure while
maintaining flexibility.

```tsx
interface DialogProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  content: React.ReactNode;
  actions: React.ReactNode;
  isOpen: boolean;
}

/**
 * Dialog component with named slots
 *
 * Stateless - UI state managed externally via props
 */
function Dialog({
  title,
  description,
  content,
  actions,
  isOpen,
}: DialogProps) {
  if (!isOpen) return null;

  return (
    <div className="dialog-overlay">
      <div className="dialog">
        <div className="dialog-header">
          <h2 className="dialog-title">{title}</h2>
          {description && <p className="dialog-description">{description}</p>}
        </div>

        <div className="dialog-content">
          {content}
        </div>

        <div className="dialog-actions">
          {actions}
        </div>
      </div>
    </div>
  );
}

// Usage with composition
function ConfirmationDialog() {
  // State managed via custom hook
  const { isOpen, closeDialog, handleConfirm } = useConfirmationDialog();

  return (
    <Dialog
      isOpen={isOpen}
      title={<span>Confirm Action</span>}
      description={<span>Are you sure you want to proceed?</span>}
      content={
        <div>
          <p>This action cannot be undone.</p>
        </div>
      }
      actions={
        <>
          <button onClick={closeDialog}>Cancel</button>
          <button onClick={handleConfirm}>Confirm</button>
        </>
      }
    />
  );
}
```

## Best Practices: Stateless Components with Custom Hooks

The key principle in our architecture: **components should be stateless and use
custom hooks for all state management and business logic**.

### Pattern 1: Extracting State to Custom Hooks

```tsx
// ❌ AVOID: Component managing its own state
function ContentCard({ contentId }: { contentId: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

  const handleLike = () => {
    setIsLiked(!isLiked);
    setLikeCount(isLiked ? likeCount - 1 : likeCount + 1);
  };

  return (
    <div>
      <button onClick={() => setIsExpanded(!isExpanded)}>
        {isExpanded ? "Collapse" : "Expand"}
      </button>
      <button onClick={handleLike}>
        {isLiked ? "Unlike" : "Like"} ({likeCount})
      </button>
    </div>
  );
}

// ✅ RECOMMENDED: Custom hook manages all state and logic
interface UseContentCardOptions {
  contentId: number;
}

interface UseContentCardReturn {
  // State
  isExpanded: boolean;
  isLiked: boolean;
  likeCount: number;

  // Actions
  toggleExpanded: () => void;
  toggleLike: () => void;
}

/**
 * Custom hook for content card functionality
 *
 * Abstracts all state management and business logic
 */
function useContentCard(
  options: UseContentCardOptions,
): UseContentCardReturn {
  const { contentId } = options;

  // State from Zustand store (atomic selectors)
  const isExpanded = useIsExpanded(contentId);
  const isLiked = useIsLiked(contentId);
  const likeCount = useLikeCount(contentId);

  // Actions from Zustand store
  const actions = useContentCardActions();

  return {
    // State
    isExpanded,
    isLiked,
    likeCount,

    // Actions
    toggleExpanded: () => actions.toggleExpanded(contentId),
    toggleLike: () => actions.toggleLike(contentId),
  };
}

/**
 * Pure presentational component
 *
 * No state - everything comes from the custom hook
 */
function ContentCard({ contentId }: { contentId: number }) {
  const {
    isExpanded,
    isLiked,
    likeCount,
    toggleExpanded,
    toggleLike,
  } = useContentCard({ contentId });

  return (
    <div>
      <button onClick={toggleExpanded}>
        {isExpanded ? "Collapse" : "Expand"}
      </button>
      <button onClick={toggleLike}>
        {isLiked ? "Unlike" : "Like"} ({likeCount})
      </button>
    </div>
  );
}
```

### Pattern 2: Composing with Scoped State (Zustand + React Context)

When you need component-scoped state (not global), combine Zustand stores with
React Context.

```tsx
// store.ts - Zustand store definition
import { createStore } from "zustand";

interface FilterState {
  searchTerm: string;
  selectedCategory: string | null;
  sortOrder: "asc" | "desc";
}

interface FilterActions {
  setSearchTerm: (term: string) => void;
  setSelectedCategory: (category: string | null) => void;
  setSortOrder: (order: "asc" | "desc") => void;
  resetFilters: () => void;
}

type FilterStore = FilterState & { actions: FilterActions };

const createFilterStore = (initialState?: Partial<FilterState>) => {
  return createStore<FilterStore>((set) => ({
    // State
    searchTerm: initialState?.searchTerm ?? "",
    selectedCategory: initialState?.selectedCategory ?? null,
    sortOrder: initialState?.sortOrder ?? "asc",

    // Actions
    actions: {
      setSearchTerm: (term) => set({ searchTerm: term }),
      setSelectedCategory: (category) => set({ selectedCategory: category }),
      setSortOrder: (order) => set({ sortOrder: order }),
      resetFilters: () =>
        set({
          searchTerm: "",
          selectedCategory: null,
          sortOrder: "asc",
        }),
    },
  }));
};

// context.tsx - React Context provider
import { createContext, type ReactNode, useContext, useState } from "react";
import { useStore } from "zustand";

const FilterStoreContext = createContext<
  ReturnType<
    typeof createFilterStore
  > | null
>(null);

interface FilterProviderProps {
  children: ReactNode;
  initialState?: Partial<FilterState>;
}

/**
 * Provider component that creates a scoped filter store
 *
 * Each instance has its own isolated state
 */
export function FilterProvider({
  children,
  initialState,
}: FilterProviderProps) {
  // Create store once per provider instance
  const [store] = useState(() => createFilterStore(initialState));

  return (
    <FilterStoreContext.Provider value={store}>
      {children}
    </FilterStoreContext.Provider>
  );
}

// hooks.ts - Custom hooks for accessing the store
type FilterSelector<T> = (state: FilterStore) => T;

/**
 * Base hook for accessing filter store
 */
function useFilterStore<T>(selector: FilterSelector<T>): T {
  const store = useContext(FilterStoreContext);

  if (!store) {
    throw new Error("useFilterStore must be used within FilterProvider");
  }

  return useStore(store, selector);
}

/**
 * Atomic selector hooks - export these
 */
export const useSearchTerm = () => useFilterStore((state) => state.searchTerm);

export const useSelectedCategory = () =>
  useFilterStore((state) => state.selectedCategory);

export const useSortOrder = () => useFilterStore((state) => state.sortOrder);

export const useFilterActions = () => useFilterStore((state) => state.actions);

/**
 * Composed hook combining multiple selectors
 */
export function useFilters() {
  return {
    searchTerm: useSearchTerm(),
    selectedCategory: useSelectedCategory(),
    sortOrder: useSortOrder(),
    actions: useFilterActions(),
  };
}

// components.tsx - Using composition with scoped state
/**
 * Filter input component - stateless, uses custom hooks
 */
function FilterSearch() {
  const searchTerm = useSearchTerm();
  const { setSearchTerm } = useFilterActions();

  return (
    <input
      type="text"
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      placeholder="Search..."
    />
  );
}

/**
 * Category selector component - stateless
 */
function FilterCategory() {
  const selectedCategory = useSelectedCategory();
  const { setSelectedCategory } = useFilterActions();

  return (
    <select
      value={selectedCategory ?? ""}
      onChange={(e) => setSelectedCategory(e.target.value || null)}
    >
      <option value="">All Categories</option>
      <option value="tech">Technology</option>
      <option value="design">Design</option>
    </select>
  );
}

/**
 * Sort control component - stateless
 */
function FilterSort() {
  const sortOrder = useSortOrder();
  const { setSortOrder } = useFilterActions();

  return (
    <button onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}>
      Sort: {sortOrder === "asc" ? "↑" : "↓"}
    </button>
  );
}

/**
 * Filter panel - composed from smaller components
 *
 * Completely stateless - all pieces use hooks
 */
function FilterPanel() {
  const { resetFilters } = useFilterActions();

  return (
    <div className="filter-panel">
      <FilterSearch />
      <FilterCategory />
      <FilterSort />
      <button onClick={resetFilters}>Reset</button>
    </div>
  );
}

/**
 * Content list that uses filter state
 */
function ContentList() {
  const filters = useFilters();

  // Use filters to fetch/filter data
  // ...

  return (
    <div>
      {/* Render filtered content */}
    </div>
  );
}

/**
 * Main dashboard - composes everything together
 *
 * Provides scoped state via FilterProvider
 */
function Dashboard() {
  return (
    <FilterProvider initialState={{ sortOrder: "desc" }}>
      <div className="dashboard">
        <FilterPanel />
        <ContentList />
      </div>
    </FilterProvider>
  );
}

/**
 * Multiple independent dashboards - each with isolated state
 */
function App() {
  return (
    <div>
      <FilterProvider>
        <Dashboard />
      </FilterProvider>

      <FilterProvider initialState={{ searchTerm: "preset" }}>
        <Dashboard />
      </FilterProvider>
    </div>
  );
}
```

### Pattern 3: Combining Async Operations with Composition

When components need to fetch data, use TanStack Query in custom hooks, not in
components.

```tsx
// hooks/useContent.ts
import { useQuery } from "@tanstack/react-query";
import { client } from "../lib/rpc";

interface UseContentOptions {
  contentId: number;
}

interface UseContentReturn {
  // Data
  content: Content | null;

  // Loading states
  isLoading: boolean;
  isError: boolean;
  error: Error | null;

  // Actions
  refetch: () => void;
}

/**
 * Hook for fetching content data
 *
 * Combines RPC client with TanStack Query
 */
export function useContent(
  options: UseContentOptions,
): UseContentReturn {
  const { contentId } = options;

  const query = useQuery({
    queryKey: ["content", contentId],
    queryFn: () => client.GET_CONTENT({ id: contentId }),
    enabled: !!contentId,
  });

  return {
    content: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// components/ContentDisplay.tsx
/**
 * Loading state component
 */
function ContentLoading() {
  return (
    <div className="content-loading">
      <Spinner />
      <p>Loading content...</p>
    </div>
  );
}

/**
 * Error state component
 */
function ContentError({ error }: { error: Error }) {
  return (
    <div className="content-error">
      <p>Failed to load content</p>
      <p className="error-message">{error.message}</p>
    </div>
  );
}

/**
 * Content data component
 */
function ContentData({ content }: { content: Content }) {
  return (
    <div className="content-data">
      <h2>{content.title}</h2>
      <p>{content.description}</p>
    </div>
  );
}

/**
 * Composed content display using composition
 *
 * Stateless - delegates to custom hook
 */
function ContentDisplay({ contentId }: { contentId: number }) {
  const { content, isLoading, isError, error } = useContent({ contentId });

  // Compose different states
  if (isLoading) return <ContentLoading />;
  if (isError) return <ContentError error={error!} />;
  if (!content) return <div>No content found</div>;

  return <ContentData content={content} />;
}
```

## Real-World Examples

### Example 1: Content Classification Card

This is a real example from our codebase showing advanced composition with
multiple concerns.

```tsx
// hooks/useContentRefresh.ts
/**
 * Hook for content refresh functionality
 *
 * Combines:
 * - Zustand store for UI state
 * - TanStack Query for async operations
 * - Business logic for refresh flow
 */
export interface UseContentRefreshOptions {
  contentId: number;
  platform: string;
  contentType: string | null;
  supportsRefresh: boolean;
}

export interface UseContentRefreshReturn {
  // State
  isCostDialogOpen: boolean;
  pendingRefreshType: RefreshType | null;
  isDetailsExpanded: boolean;
  supportsRefresh: boolean;

  // Actions
  handleRefreshClick: (refreshType: RefreshType) => Promise<void>;
  handleConfirmRefresh: () => Promise<void>;
  handleCostDialogClose: (open: boolean) => void;
  toggleDetails: () => void;

  // Data
  costEstimate: CostEstimate | null;
  isEstimating: boolean;
  isRefreshing: boolean;
}

export function useContentRefresh(
  options: UseContentRefreshOptions,
): UseContentRefreshReturn {
  const { contentId, supportsRefresh } = options;

  // Zustand store state (atomic selectors)
  const isCostDialogOpen = useIsCostDialogOpen(contentId);
  const pendingRefreshType = usePendingRefreshType(contentId);
  const isDetailsExpanded = useIsDetailsExpanded(contentId);

  // Zustand store actions
  const actions = useContentRefreshActions();

  // TanStack Query mutations
  const estimateCostMutation = useEstimateRefreshCost();
  const refreshMutation = useManualRefresh();

  // Business logic
  const handleRefreshClick = async (refreshType: RefreshType) => {
    if (!supportsRefresh) {
      toast.error("Refresh not supported for this platform");
      return;
    }

    try {
      actions.setPendingRefreshType(contentId, refreshType);
      await estimateCostMutation.mutateAsync({ contentId, refreshType });
      actions.openCostDialog(contentId);
    } catch (error) {
      toast.error("Failed to estimate cost");
      actions.setPendingRefreshType(contentId, null);
    }
  };

  const handleConfirmRefresh = async () => {
    if (!pendingRefreshType) return;

    try {
      await refreshMutation.mutateAsync({
        contentId,
        refreshType: pendingRefreshType,
      });
      toast.success("Refresh started successfully");
      actions.closeCostDialog(contentId);
    } catch (error) {
      toast.error("Failed to start refresh");
    }
  };

  return {
    isCostDialogOpen,
    pendingRefreshType,
    isDetailsExpanded,
    supportsRefresh,
    handleRefreshClick,
    handleConfirmRefresh,
    handleCostDialogClose: (open) =>
      open
        ? actions.openCostDialog(contentId)
        : actions.closeCostDialog(contentId),
    toggleDetails: () => actions.toggleDetails(contentId),
    costEstimate: estimateCostMutation.data ?? null,
    isEstimating: estimateCostMutation.isPending,
    isRefreshing: refreshMutation.isPending,
  };
}

// components/ContentRefreshButton.tsx
/**
 * Refresh button component - pure presentation
 */
interface RefreshButtonProps {
  onRefresh: () => void;
  isRefreshing: boolean;
  disabled: boolean;
}

function RefreshButton({
  onRefresh,
  isRefreshing,
  disabled,
}: RefreshButtonProps) {
  return (
    <button
      onClick={onRefresh}
      disabled={disabled || isRefreshing}
      className="refresh-button"
    >
      {isRefreshing
        ? (
          <>
            <Spinner size="sm" />
            Refreshing...
          </>
        )
        : (
          <>
            <RefreshIcon />
            Refresh
          </>
        )}
    </button>
  );
}

// components/CostEstimateDialog.tsx
/**
 * Cost estimate dialog - pure presentation
 */
interface CostEstimateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  costEstimate: CostEstimate | null;
  isEstimating: boolean;
  isRefreshing: boolean;
}

function CostEstimateDialog({
  isOpen,
  onClose,
  onConfirm,
  costEstimate,
  isEstimating,
  isRefreshing,
}: CostEstimateDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      title={<span>Confirm Refresh</span>}
      content={isEstimating ? <Spinner /> : (
        <div>
          <p>Estimated cost: ${costEstimate?.cost}</p>
          <p>Items to update: {costEstimate?.itemCount}</p>
        </div>
      )}
      actions={
        <>
          <button onClick={onClose}>Cancel</button>
          <button
            onClick={onConfirm}
            disabled={isEstimating || isRefreshing}
          >
            {isRefreshing ? "Refreshing..." : "Confirm"}
          </button>
        </>
      }
    />
  );
}

// components/ContentClassificationCard.tsx
/**
 * Main card component - composes everything
 *
 * Completely stateless - all state from custom hooks
 */
interface ContentClassificationCardProps {
  contentId: number;
  platform: string;
  contentType: string | null;
}

function ContentClassificationCard({
  contentId,
  platform,
  contentType,
}: ContentClassificationCardProps) {
  // All state and logic from custom hooks
  const contentRefresh = useContentRefresh({
    contentId,
    platform,
    contentType,
    supportsRefresh: supportsRefresh(platform),
  });

  return (
    <Card>
      <CardHeader>
        <h3>Content {contentId}</h3>

        {contentRefresh.supportsRefresh && (
          <RefreshButton
            onRefresh={() => contentRefresh.handleRefreshClick("full")}
            isRefreshing={contentRefresh.isRefreshing}
            disabled={!contentRefresh.supportsRefresh}
          />
        )}
      </CardHeader>

      <CardContent>
        {/* Content details */}
      </CardContent>

      <CostEstimateDialog
        isOpen={contentRefresh.isCostDialogOpen}
        onClose={() => contentRefresh.handleCostDialogClose(false)}
        onConfirm={contentRefresh.handleConfirmRefresh}
        costEstimate={contentRefresh.costEstimate}
        isEstimating={contentRefresh.isEstimating}
        isRefreshing={contentRefresh.isRefreshing}
      />
    </Card>
  );
}
```

### Example 2: Form Builder with Composition

```tsx
// components/form/FormField.tsx
interface FormFieldProps {
  label: React.ReactNode;
  input: React.ReactNode;
  error?: React.ReactNode;
  hint?: React.ReactNode;
}

/**
 * Generic form field using composition
 *
 * Accepts label, input, error, and hint as slots
 */
function FormField({ label, input, error, hint }: FormFieldProps) {
  return (
    <div className="form-field">
      <label className="form-label">{label}</label>
      <div className="form-input">{input}</div>
      {hint && <p className="form-hint">{hint}</p>}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

// hooks/useForm.ts
interface UseFormOptions<T> {
  initialValues: T;
  onSubmit: (values: T) => Promise<void>;
}

interface UseFormReturn<T> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  isSubmitting: boolean;
  handleChange: (field: keyof T) => (value: any) => void;
  handleSubmit: () => Promise<void>;
}

/**
 * Generic form hook
 */
function useForm<T extends Record<string, any>>(
  options: UseFormOptions<T>,
): UseFormReturn<T> {
  const { initialValues, onSubmit } = options;

  // State management
  const values = useFormValues(initialValues);
  const errors = useFormErrors<T>();
  const isSubmitting = useIsSubmitting();
  const actions = useFormActions<T>();

  return {
    values,
    errors,
    isSubmitting,
    handleChange: (field) => (value) => actions.setValue(field, value),
    handleSubmit: async () => {
      actions.setSubmitting(true);
      try {
        await onSubmit(values);
        actions.resetForm(initialValues);
      } catch (error) {
        actions.setError("submit", "Failed to submit form");
      } finally {
        actions.setSubmitting(false);
      }
    },
  };
}

// components/UserForm.tsx
/**
 * Composed form using FormField components
 *
 * Stateless - uses custom form hook
 */
function UserForm() {
  const form = useForm({
    initialValues: {
      name: "",
      email: "",
      bio: "",
    },
    onSubmit: async (values) => {
      await client.CREATE_USER(values);
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <FormField
        label={<span>Name</span>}
        input={
          <input
            type="text"
            value={form.values.name}
            onChange={(e) => form.handleChange("name")(e.target.value)}
          />
        }
        error={form.errors.name}
      />

      <FormField
        label={<span>Email</span>}
        input={
          <input
            type="email"
            value={form.values.email}
            onChange={(e) => form.handleChange("email")(e.target.value)}
          />
        }
        error={form.errors.email}
        hint={<span>We'll never share your email</span>}
      />

      <FormField
        label={<span>Bio</span>}
        input={
          <textarea
            value={form.values.bio}
            onChange={(e) => form.handleChange("bio")(e.target.value)}
          />
        }
        error={form.errors.bio}
      />

      <button type="submit" disabled={form.isSubmitting}>
        {form.isSubmitting ? "Submitting..." : "Submit"}
      </button>
    </form>
  );
}
```

## Advanced Patterns

### Render Props Pattern

Render props is a technique for sharing code using a prop whose value is a
function.

```tsx
interface DataProviderProps<T> {
  children: (data: {
    data: T | null;
    isLoading: boolean;
    error: Error | null;
  }) => React.ReactNode;
  dataSource: () => Promise<T>;
}

/**
 * Generic data provider using render props
 *
 * Delegates rendering to consumer via function prop
 */
function DataProvider<T>({ children, dataSource }: DataProviderProps<T>) {
  // Use custom hook for data fetching
  const { data, isLoading, error } = useAsync(dataSource);

  // Call the render prop function
  return <>{children({ data, isLoading, error })}</>;
}

// Usage
function UserProfile({ userId }: { userId: number }) {
  return (
    <DataProvider dataSource={() => client.GET_USER({ id: userId })}>
      {({ data, isLoading, error }) => {
        if (isLoading) return <Spinner />;
        if (error) return <ErrorMessage error={error} />;
        if (!data) return <div>No user found</div>;

        return (
          <div>
            <h2>{data.name}</h2>
            <p>{data.email}</p>
          </div>
        );
      }}
    </DataProvider>
  );
}
```

### Compound Components Pattern

Compound components share state implicitly through context.

```tsx
// Tabs implementation
interface TabsContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

/**
 * Custom hook to access tabs context
 */
function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error("Tabs components must be used within <Tabs>");
  }
  return context;
}

/**
 * Root tabs component
 */
interface TabsProps {
  children: React.ReactNode;
  defaultTab?: string;
}

function Tabs({ children, defaultTab }: TabsProps) {
  // State management via custom hook
  const { activeTab, setActiveTab } = useTabs(defaultTab);

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className="tabs">{children}</div>
    </TabsContext.Provider>
  );
}

/**
 * Tab list component
 */
function TabList({ children }: { children: React.ReactNode }) {
  return <div className="tab-list" role="tablist">{children}</div>;
}

/**
 * Individual tab component
 */
interface TabProps {
  value: string;
  children: React.ReactNode;
}

function Tab({ value, children }: TabProps) {
  const { activeTab, setActiveTab } = useTabsContext();
  const isActive = activeTab === value;

  return (
    <button
      role="tab"
      aria-selected={isActive}
      className={`tab ${isActive ? "tab-active" : ""}`}
      onClick={() => setActiveTab(value)}
    >
      {children}
    </button>
  );
}

/**
 * Tab panels container
 */
function TabPanels({ children }: { children: React.ReactNode }) {
  return <div className="tab-panels">{children}</div>;
}

/**
 * Individual tab panel
 */
interface TabPanelProps {
  value: string;
  children: React.ReactNode;
}

function TabPanel({ value, children }: TabPanelProps) {
  const { activeTab } = useTabsContext();

  if (activeTab !== value) return null;

  return (
    <div role="tabpanel" className="tab-panel">
      {children}
    </div>
  );
}

// Attach subcomponents
Tabs.List = TabList;
Tabs.Tab = Tab;
Tabs.Panels = TabPanels;
Tabs.Panel = TabPanel;

// Usage - beautiful composition API
function ContentTabs() {
  return (
    <Tabs defaultTab="overview">
      <Tabs.List>
        <Tabs.Tab value="overview">Overview</Tabs.Tab>
        <Tabs.Tab value="analytics">Analytics</Tabs.Tab>
        <Tabs.Tab value="settings">Settings</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panels>
        <Tabs.Panel value="overview">
          <OverviewContent />
        </Tabs.Panel>
        <Tabs.Panel value="analytics">
          <AnalyticsContent />
        </Tabs.Panel>
        <Tabs.Panel value="settings">
          <SettingsContent />
        </Tabs.Panel>
      </Tabs.Panels>
    </Tabs>
  );
}
```

## Common Pitfalls and Solutions

### Pitfall 1: Prop Drilling

**Problem**: Passing props through many layers of components.

```tsx
// ❌ Prop drilling
function App() {
  const user = useUser();
  return <Dashboard user={user} />;
}

function Dashboard({ user }) {
  return <Content user={user} />;
}

function Content({ user }) {
  return <Profile user={user} />;
}

function Profile({ user }) {
  return <div>{user.name}</div>;
}
```

**Solution**: Use composition or context.

```tsx
// ✅ Context + custom hooks
const UserContext = createContext<User | null>(null);

function useUser() {
  const user = useContext(UserContext);
  if (!user) throw new Error("Missing UserProvider");
  return user;
}

function App() {
  const user = useAuthenticatedUser();

  return (
    <UserContext.Provider value={user}>
      <Dashboard />
    </UserContext.Provider>
  );
}

// No prop drilling - components use hook directly
function Profile() {
  const user = useUser();
  return <div>{user.name}</div>;
}
```

### Pitfall 2: Over-abstraction

**Problem**: Creating too many layers of abstraction.

```tsx
// ❌ Over-abstracted
function SuperGenericWrapper({ children, ...props }) {
  return <div {...props}>{children}</div>;
}

function GenericContainer({ children }) {
  return (
    <SuperGenericWrapper className="container">
      {children}
    </SuperGenericWrapper>
  );
}

// Just use a div!
```

**Solution**: Only abstract when you have a clear reason.

```tsx
// ✅ Abstract with purpose
function Card({ children, className = "" }: CardProps) {
  return (
    <div className={`card ${className}`}>
      {children}
    </div>
  );
}

// Clear benefit: consistent styling, semantic meaning
```

### Pitfall 3: Mixing State Management Approaches

**Problem**: Some components use hooks, others use local state.

```tsx
// ❌ Inconsistent
function ComponentA() {
  const [value, setValue] = useState(0); // Local state
  // ...
}

function ComponentB() {
  const value = useValue(); // Hook
  // ...
}
```

**Solution**: Consistent approach across codebase.

```tsx
// ✅ Consistent - always use custom hooks
function ComponentA() {
  const { value, setValue } = useComponentAState();
  // ...
}

function ComponentB() {
  const { value, setValue } = useComponentBState();
  // ...
}
```

### Pitfall 4: Large Component with Many Responsibilities

**Problem**: One component doing too much.

```tsx
// ❌ Monolithic component
function UserDashboard() {
  // Fetching user data
  const { data: user } = useQuery(...);
  
  // Fetching posts
  const { data: posts } = useQuery(...);
  
  // Form state
  const [formData, setFormData] = useState({});
  
  // Modal state
  const [isModalOpen, setModalOpen] = useState(false);
  
  // etc...
  
  return (
    <div>
      {/* 500 lines of JSX */}
    </div>
  );
}
```

**Solution**: Break into composed components with focused responsibilities.

```tsx
// ✅ Composed from focused components
function UserDashboard() {
  return (
    <DashboardLayout>
      <DashboardHeader />
      <DashboardContent>
        <UserProfile />
        <UserPosts />
        <UserSettings />
      </DashboardContent>
    </DashboardLayout>
  );
}

// Each component has single responsibility
function UserProfile() {
  const { user, isLoading } = useUser();
  // Only handles user profile display
}

function UserPosts() {
  const { posts, isLoading } = usePosts();
  // Only handles posts list
}
```

## Conclusion

The Composition Pattern is fundamental to building maintainable React
applications. Combined with modern best practices like:

- **Stateless components** that delegate to custom hooks
- **Scoped state management** with Zustand + React Context
- **Separation of concerns** between UI and business logic
- **Atomic selectors** for fine-grained reactivity

You can build applications that are:

- ✅ Easy to understand
- ✅ Easy to test
- ✅ Easy to maintain
- ✅ Easy to extend

Remember the key principles:

1. **Compose, don't inherit**: Build complex UIs from simple components
2. **Keep components stateless**: All state in custom hooks
3. **Use context for dependency injection**: Not for state distribution
4. **Break down large components**: Each component should have a single
   responsibility
5. **Test components in isolation**: Composition makes this natural

### Key Takeaways

- Composition is about combining small, focused components
- React encourages composition over inheritance
- Keep components stateless - use custom hooks for state
- Use children, props, and slots for flexible composition
- Combine Zustand stores with React Context for scoped state
- Separate async operations (TanStack Query) from UI state (Zustand)
- Export atomic selector hooks, not raw stores
- Test composed components in isolation with providers

### Further Reading

- [React Composition Guide](https://react.dev/learn/passing-props-to-a-component#passing-jsx-as-children)
- [Zustand with React Context](https://tkdodo.eu/blog/zustand-and-react-context)
- [TanStack Query Best Practices](https://tanstack.com/query/latest/docs/framework/react/guides/testing)
- [Testing Composed Components](https://testing-library.com/docs/react-testing-library/example-intro)

---

## References

Based on the following resources:

- [Understanding the Composition Pattern in React](https://dev.to/wallacefreitas/understanding-the-composition-pattern-in-react-3dfp)
- [Explain the Composition Pattern in React](https://www.greatfrontend.com/questions/quiz/explain-the-composition-pattern-in-react)
- [Zustand and React Context](https://tkdodo.eu/blog/zustand-and-react-context)
  by Dominik (TkDodo)
- React Official Documentation
- Our internal codebase patterns and best practices
