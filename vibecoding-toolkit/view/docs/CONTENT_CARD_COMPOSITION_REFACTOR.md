# Content Card Composition Refactoring

## Overview

Refatoração do `ContentCard` seguindo o **Composition Pattern** para permitir
reutilização elegante em dois contextos:

1. **Listagem** (`conteudos.tsx`) - Modo compacto, grid view
2. **Detalhe** (`conteudo-detail.tsx`) - Modo expandido, single view

## Architecture Changes

### Before (Monolithic Component)

```
ContentCard (337 lines)
├── All logic mixed together
├── Conditional rendering everywhere
├── Hard to maintain
└── Poor separation of concerns
```

### After (Composition Pattern)

```
ContentCard (main orchestrator)
├── ContentCardCompact (compact composition)
│   ├── ContentCardHeader
│   ├── ContentMediaGallery (compact mode)
│   ├── ContentCardBody
│   └── ContentCardFooter
└── ContentCardExpanded (expanded composition)
    ├── ContentCardHeader
    ├── ContentMediaGallery (expanded mode)
    ├── ContentCardBody
    └── ContentCardFooter
```

## New Components Structure

### 1. ContentCardHeader.tsx

**Responsibility**: Platform badges and delete action

- Pure presentational component
- No state management
- Props-based configuration

**Key Features**:

- Platform badge with filtering
- Content type badge
- Optional delete button with confirmation dialog

### 2. ContentCardBody.tsx

**Responsibility**: Content text, metadata, and engagement metrics

- Adapts layout based on mode (compact/expanded)
- Compact: Fixed heights, line-clamp
- Expanded: Full content, no truncation

**Key Features**:

- Title (compact: 2 lines, expanded: full)
- Text (compact: truncated, expanded: full)
- Author username
- Engagement metrics (likes, views, shares)
- Published date

### 3. ContentCardFooter.tsx

**Responsibility**: "Ver original" link button

- Simple, focused component
- Opens URL in new tab

### 4. ContentMediaGallery.tsx (Refactored)

**Responsibility**: Media display with two distinct modes

#### Compact Mode

- Fixed height (320px)
- Grid layout for multiple images
- Optimized for card lists
- Shows "+N" indicator for >4 images

#### Expanded Mode ⭐ NEW

- **Carousel with navigation arrows**
- **Large image display (500px height)**
- **Thumbnail strip below main image**
- **Image counter (1/5)**
- **Object-contain for proper aspect ratio**
- **Active thumbnail highlighting**
- Perfect for detail pages

### 5. ContentCard.tsx (Main Orchestrator)

**Responsibility**: Route to correct composition based on mode

- Delegates to `ContentCardCompact` or `ContentCardExpanded`
- Manages custom hook (`useContentCard`)
- No conditional rendering logic - pure composition

## Composition Pattern Benefits

### ✅ Single Responsibility

Each component has one clear purpose:

- Header → Badges & actions
- Body → Content & metrics
- Footer → External link
- Gallery → Media display
- Orchestrator → Composition routing

### ✅ Reusability

Components can be used in different contexts:

```tsx
// Use in list
<ContentCard content={item} mode="compact" onDelete={handleDelete} />

// Use in detail page
<ContentCard content={item} mode="expanded" />
```

### ✅ Maintainability

- Small, focused files (~50-100 lines each)
- Easy to understand and modify
- Changes isolated to specific components

### ✅ Testability

Each component can be tested in isolation:

```tsx
// Test header independently
<ContentCardHeader platform="instagram" ... />

// Test body independently
<ContentCardBody title="Test" mode="compact" ... />
```

### ✅ Flexibility

Easy to add new modes or variations:

```tsx
// Future: Add "preview" mode
function ContentCardPreview({ ... }) {
  return (
    <Card>
      <ContentMediaGallery mode="compact" />
      {/* Minimal info */}
    </Card>
  );
}
```

## Usage Examples

### In List View (Compact)

```tsx
// view/src/routes/conteudos.tsx
<GridContainer columns={{ default: 3, md: 4, lg: 5 }}>
  {contents.map((content) => (
    <ContentCard
      key={content.id}
      content={content}
      mode="compact" // Default
      onDelete={handleDelete}
    />
  ))}
</GridContainer>;
```

**Features**:

- Click to navigate to detail
- Fixed height cards for consistent grid
- Hover effects
- Delete button on hover
- Grid image layout

### In Detail View (Expanded)

```tsx
// view/src/components/content/ContentDetailView.tsx
<ContentCard
  content={content}
  mode="expanded"
/>;
```

**Features**:

- No navigation (detail page)
- Full content display
- Carousel for multiple images
- Large, prominent display
- No delete button

## Media Gallery Improvements

### Compact Mode

```
┌─────────────────┐
│                 │
│  Single Image   │  Fixed 320px height
│     (cover)     │  Grid for 2-4 images
│                 │
└─────────────────┘
```

### Expanded Mode (New) ⭐

```
┌───────────────────────────────────┐
│                                   │
│         Main Image/Video          │  500px height
│          (contain)                │  Black background
│  ← [Prev]              [Next] →  │  Navigation
│                              1/5  │  Counter
└───────────────────────────────────┘
┌─────┬─────┬─────┬─────┬─────┐
│ 📷  │ 📷  │ 📷  │ 📷  │ 📷  │    Thumbnails
└─────┴─────┴─────┴─────┴─────┘    (active highlighted)
```

## Custom Hook Pattern

All state management remains in the custom hook:

```tsx
function useContentCard({ content }: { content: DigitalContent }) {
  // Navigation
  const navigate = useNavigate();
  const navigateToDetail = useCallback(() => { ... }, []);

  // Filters
  const dataSourceId = useDataSourceId();
  const { setDataSourceId } = useContentFiltersActions();
  const toggleSourcePlatformFilter = useCallback(() => { ... }, []);

  // Computed values
  const mediaUrls = useMemo(() => getContentMediaUrls(content), [content]);
  const hasComments = useMemo(() => content.commentsCount > 0, [content]);

  // Formatters
  const formatNumber = useCallback((num) => { ... }, []);
  const formatDate = useCallback((date) => { ... }, []);
  const truncateText = useCallback((text, max) => { ... }, []);

  return { /* all computed values and actions */ };
}
```

**Benefits**:

- Components remain stateless
- Logic is reusable and testable
- Clear separation of concerns

## File Structure

```
view/src/components/content/
├── ContentCard.tsx                 (Main orchestrator - 293 lines)
├── ContentCardHeader.tsx           (Badge & actions - 70 lines)
├── ContentCardBody.tsx             (Content display - 100 lines)
├── ContentCardFooter.tsx           (Link button - 30 lines)
├── ContentMediaGallery.tsx         (Media display - 180 lines)
├── CommentsList.tsx                (Existing)
└── ContentDetailView.tsx           (Uses ContentCard)
```

## Performance Considerations

### Optimizations

- `useMemo` for expensive computations (mediaUrls, hasComments)
- `useCallback` for event handlers
- Carousel state only in expanded mode
- No unnecessary re-renders

### Bundle Size

- Tree-shaking friendly
- Each component can be code-split if needed
- Smaller individual files

## Future Enhancements

### Easy to Add

1. **Preview Mode**: Mini cards for quick view
2. **Comparison Mode**: Side-by-side cards
3. **Print Mode**: Optimized for printing
4. **Mobile Mode**: Responsive variations
5. **Fullscreen Mode**: Gallery lightbox

### Example: Adding Preview Mode

```tsx
// 1. Create new composition
function ContentCardPreview({ content, useContentCardHook }) {
  const { mediaUrls, contentTypeLabel } = useContentCardHook;
  
  return (
    <Card className="h-32">
      <div className="h-16">
        <ContentMediaGallery mediaUrls={mediaUrls} mode="compact" />
      </div>
      <div className="p-2">
        <Badge>{contentTypeLabel}</Badge>
      </div>
    </Card>
  );
}

// 2. Add to main component
export function ContentCard({ mode, ... }) {
  if (mode === "preview") {
    return <ContentCardPreview ... />;
  }
  // ...
}
```

## Testing Strategy

### Unit Tests

```tsx
// Test individual components
describe("ContentCardHeader", () => {
  it("should display platform badge", () => { ... });
  it("should call onPlatformClick when clicked", () => { ... });
  it("should show delete button when onDelete provided", () => { ... });
});

describe("ContentMediaGallery", () => {
  it("should display single image in compact mode", () => { ... });
  it("should display carousel in expanded mode", () => { ... });
  it("should navigate between images", () => { ... });
});
```

### Integration Tests

```tsx
// Test composition
describe("ContentCard", () => {
  it("should compose compact mode correctly", () => { ... });
  it("should compose expanded mode correctly", () => { ... });
  it("should navigate to detail on click in compact mode", () => { ... });
});
```

## Migration Notes

### Breaking Changes

✅ None - Public API remains the same:

```tsx
<ContentCard content={content} mode="compact|expanded" onDelete={fn} />;
```

### Internal Changes

- Extracted sub-components
- Improved media gallery with carousel
- Better separation of concerns

## Conclusion

This refactoring demonstrates the power of the **Composition Pattern**:

1. **Before**: One 337-line monolithic component
2. **After**: 5 focused components, each <200 lines

**Key Wins**:

- ✅ Better code organization
- ✅ Easier maintenance
- ✅ Improved media display (carousel!)
- ✅ More testable
- ✅ More flexible for future changes
- ✅ Follows React best practices
- ✅ Maintains same public API

The expanded mode now has a **professional image carousel** with:

- Large image display
- Navigation arrows
- Thumbnail strip
- Active indicator
- Image counter

Perfect for showcasing social media content! 🎉
