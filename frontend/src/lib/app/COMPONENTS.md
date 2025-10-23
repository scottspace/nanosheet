# Component Architecture

## Visual Structure

```
┌─────────────────────────────────────────────────────────────┐
│ AppLayout.svelte                                            │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ Toolbar.svelte                                        │  │
│ │ ┌──────────┬──────┬──────┬─────────┬────┬────┬────┐  │  │
│ │ │ Title    │ Undo │ Redo │ Archive │ ... │ ... │ SP │  │  │
│ │ └──────────┴──────┴──────┴─────────┴────┴────┴────┘  │  │
│ └───────────────────────────────────────────────────────┘  │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ Breadcrumb.svelte (optional)                          │  │
│ │ Film > Block 1 > Scene 3 > Shots                      │  │
│ └───────────────────────────────────────────────────────┘  │
│ ┌──────────┬────────────────────────────────────────────┐  │
│ │ Levels   │ Main Content Area                          │  │
│ │ Bar      │ (children snippet)                         │  │
│ │ ┌──────┐ │ ┌────────────────────────────────────────┐ │  │
│ │ │Mystic│ │ │                                        │ │  │
│ │ │Lake  │ │ │   Your content here                    │ │  │
│ │ ├──────┤ │ │   (SheetGrid, etc.)                    │ │  │
│ │ │Film  │ │ │                                        │ │  │
│ │ │Blocks│ │ │                                        │ │  │
│ │ │Scenes│ │ │                                        │ │  │
│ │ │Shots*│ │ │                                        │ │  │
│ │ │Images│ │ │                                        │ │  │
│ │ └──────┘ │ └────────────────────────────────────────┘ │  │
│ └──────────┴────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Component Hierarchy

```
AppLayout.svelte
├── Toolbar.svelte
│   ├── App Title
│   ├── Undo/Redo Buttons
│   ├── Archive Button
│   ├── Thumbnail Size Dropdown
│   │   └── Thumbnail Menu (conditional)
│   ├── Sound Toggle
│   ├── Ellipsis Menu
│   │   └── Sticky Top Row Toggle (conditional)
│   ├── Regenerate Button (dev)
│   └── Profile Badge
├── Breadcrumb.svelte (optional)
│   └── BreadcrumbItem[] (clickable segments)
├── LevelsBar.svelte
│   ├── Project Name Input
│   └── Navigation Levels
│       ├── Film (0)
│       ├── Blocks (0)
│       ├── Scenes (0)
│       ├── Shots (3) ← active
│       └── Images (7)
└── Main Content (slot)
    └── {children} snippet
```

## Data Flow

```
┌──────────────┐
│ +page.svelte │ (or your main page)
└──────┬───────┘
       │
       │ props & callbacks
       ▼
┌──────────────────┐
│ AppLayout        │
│                  │
│ ┌──────────────┐ │
│ │ Toolbar      │ │◄── Props: selectedThumbnailSize, isSoundMuted, etc.
│ │              │ │◄── Callbacks: onUndo, onRedo, onToggleSound, etc.
│ └──────────────┘ │
│                  │
│ ┌──────────────┐ │
│ │ Breadcrumb   │ │◄── Props: breadcrumbs[]
│ └──────────────┘ │
│                  │
│ ┌──────────────┐ │
│ │ LevelsBar    │ │◄── Props: projectName, levels[]
│ │              │ │◄── Callbacks: onProjectNameChange, onLevelClick
│ └──────────────┘ │
│                  │
│ ┌──────────────┐ │
│ │ Content      │ │
│ │ (children)   │ │◄── Your main content via snippet
│ └──────────────┘ │
└──────────────────┘
```

## Props Interface Summary

### AppLayout Props
Combines all child component props:
- **Toolbar props**: 13 props (state + 8 callbacks)
- **LevelsBar props**: 4 props (projectName, levels, 2 callbacks)
- **Breadcrumb props**: 1 prop (breadcrumbs array)
- **Content**: 1 snippet (children)

### Toolbar Props (13 total)
**State (5):**
- `selectedThumbnailSize: number` (0-7)
- `showThumbnailMenu: boolean`
- `isSoundMuted: boolean`
- `stickyTopRow: boolean`
- `openEllipsisMenu: string | null`

**Callbacks (8):**
- `onUndo: () => void`
- `onRedo: () => void`
- `onRegenerate: () => void`
- `onToggleThumbnailMenu: () => void`
- `onSelectThumbnailSize: (index: number) => void`
- `onToggleSound: () => void`
- `onToggleStickyTopRow: () => void`
- `onToggleEllipsisMenu: (id: string) => void`

### LevelsBar Props (4 total)
**State (2):**
- `projectName: string`
- `levels: Level[]`

**Callbacks (2, optional):**
- `onProjectNameChange?: (name: string) => void`
- `onLevelClick?: (index: number) => void`

### Breadcrumb Props (1 total)
**State (1):**
- `breadcrumbs: BreadcrumbItem[]`

## Type Definitions

```typescript
// LevelsBar
interface Level {
  name: string      // Display name (e.g., "Shots")
  count: number     // Item count (e.g., 3)
  active: boolean   // Is this level active?
}

// Breadcrumb
interface BreadcrumbItem {
  label: string           // Display text
  onclick?: () => void    // Optional click handler
}
```

## Styling System

All components share a consistent dark theme:

**Colors:**
```css
--bg-primary: #000          /* Main content background */
--bg-secondary: #0a0a0a     /* Toolbar/sidebar background */
--bg-elevated: #1a1a1a      /* Menus/dropdowns */

--text-primary: rgba(255, 255, 255, 0.9)    /* Main text */
--text-secondary: rgba(255, 255, 255, 0.6)  /* Secondary text */
--text-tertiary: rgba(255, 255, 255, 0.5)   /* Disabled/muted */

--border-subtle: rgba(255, 255, 255, 0.08)     /* Main borders */
--border-emphasis: rgba(255, 255, 255, 0.15)   /* Focused/hover */

--hover-bg: rgba(255, 255, 255, 0.08)       /* Hover state */
--active-bg: rgba(255, 255, 255, 0.1)       /* Active/selected */
```

**Transitions:**
```css
transition: all 0.15s;  /* All interactive elements */
```

**Border Radius:**
```css
--radius-sm: 4px   /* Small elements */
--radius-md: 6px   /* Buttons */
--radius-lg: 8px   /* Dropdowns/menus */
--radius-full: 50% /* Profile pic */
```

## File Sizes

| File | Lines | Size | Description |
|------|-------|------|-------------|
| `AppLayout.svelte` | 158 | 3.5 KB | Main layout composer |
| `Toolbar.svelte` | 391 | 11 KB | Top toolbar with all controls |
| `LevelsBar.svelte` | 155 | 3 KB | Left sidebar navigation |
| `Breadcrumb.svelte` | 136 | 2.9 KB | Breadcrumb navigation |
| `index.ts` | 18 | 617 B | Barrel exports |
| `README.md` | 260 | 7.8 KB | Usage documentation |
| `COMPONENTS.md` | — | — | This architecture guide |
| **Total** | **1,118** | **~29 KB** | Complete app shell |

## Benefits

1. **Modularity**: Each component has a single, well-defined responsibility
2. **Reusability**: Components can be used independently or composed
3. **Type Safety**: Full TypeScript typing with Svelte 5 runes
4. **Consistency**: Shared styling system across all components
5. **Maintainability**: Clear separation of concerns
6. **Documentation**: Comprehensive JSDoc comments and README
7. **Flexibility**: Optional features (breadcrumb, callbacks)
8. **Performance**: Minimal re-renders, efficient state management

## Migration Path

To use these components in your existing app:

1. **Import the layout:**
   ```typescript
   import { AppLayout } from '$lib/app'
   import type { Level, BreadcrumbItem } from '$lib/app'
   ```

2. **Define your data:**
   ```typescript
   const levels: Level[] = [...]
   const breadcrumbs: BreadcrumbItem[] = [...]
   ```

3. **Wrap your content:**
   ```svelte
   <AppLayout
     {...toolbarProps}
     {...levelsBarProps}
     {breadcrumbs}
   >
     <!-- Your existing content -->
   </AppLayout>
   ```

4. **Remove old markup:**
   Delete the toolbar and sidebar HTML from your main page

That's it! Your app now uses the modular component system.
