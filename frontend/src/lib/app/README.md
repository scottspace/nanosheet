# App Shell Components

This directory contains the application shell components extracted from the main page. These components provide a clean, modular structure for the Storyboard application UI.

## Components

### AppLayout.svelte

Top-level layout component that composes the entire application shell.

**Features:**
- Toolbar at top
- Optional breadcrumb navigation
- Left sidebar (LevelsBar)
- Main content area (via children snippet)

**Usage:**
```svelte
<script lang="ts">
  import { AppLayout } from '$lib/app'
  import type { Level } from '$lib/app'

  const levels: Level[] = [
    { name: 'Film', count: 0, active: false },
    { name: 'Blocks', count: 0, active: false },
    { name: 'Scenes', count: 0, active: false },
    { name: 'Shots', count: 3, active: true },
    { name: 'Images', count: 7, active: false }
  ]
</script>

<AppLayout
  selectedThumbnailSize={3}
  showThumbnailMenu={false}
  isSoundMuted={false}
  stickyTopRow={true}
  openEllipsisMenu={null}
  onUndo={handleUndo}
  onRedo={handleRedo}
  onRegenerate={handleRegenerate}
  onToggleThumbnailMenu={toggleThumbnailMenu}
  onSelectThumbnailSize={selectThumbnailSize}
  onToggleSound={toggleSound}
  onToggleStickyTopRow={toggleStickyTopRow}
  onToggleEllipsisMenu={toggleEllipsisMenu}
  projectName="Mystic Lake"
  {levels}
  breadcrumbs={[
    { label: 'Film', onclick: () => console.log('Go to Film') },
    { label: 'Block 1', onclick: () => console.log('Go to Block 1') },
    { label: 'Scene 3' } // Last item, no onclick
  ]}
>
  <!-- Your main content here -->
  <div>Main content area</div>
</AppLayout>
```

### Toolbar.svelte

Top application toolbar with all controls.

**Features:**
- App title ("Storyboard")
- Undo/Redo buttons
- Archive button
- Thumbnail size dropdown (8 sizes from 160×90 to 448×252)
- Sound mute/unmute toggle
- Ellipsis menu with sticky top row toggle
- Regenerate button (dev)
- Profile badge

**Props:**
```typescript
interface Props {
  selectedThumbnailSize: number        // 0-7
  showThumbnailMenu: boolean
  isSoundMuted: boolean
  stickyTopRow: boolean
  openEllipsisMenu: string | null
  onUndo: () => void
  onRedo: () => void
  onRegenerate: () => void
  onToggleThumbnailMenu: () => void
  onSelectThumbnailSize: (index: number) => void
  onToggleSound: () => void
  onToggleStickyTopRow: () => void
  onToggleEllipsisMenu: (id: string) => void
}
```

**Thumbnail Sizes:**
All sizes maintain 16:9 aspect ratio:
- 160 × 90
- 192 × 108
- 224 × 126
- 256 × 144 (default)
- 288 × 162
- 320 × 180
- 384 × 216
- 448 × 252

### LevelsBar.svelte

Left sidebar navigation for different project levels.

**Features:**
- Editable project name
- Navigation levels with item counts
- Active level highlighting
- Hover effects

**Props:**
```typescript
interface Props {
  projectName: string
  levels: Level[]
  onProjectNameChange?: (name: string) => void
  onLevelClick?: (index: number) => void
}

interface Level {
  name: string      // e.g., "Shots"
  count: number     // e.g., 3
  active: boolean   // Is this level currently active?
}
```

**Usage:**
```svelte
<LevelsBar
  projectName="Mystic Lake"
  levels={[
    { name: 'Film', count: 0, active: false },
    { name: 'Blocks', count: 0, active: false },
    { name: 'Scenes', count: 0, active: false },
    { name: 'Shots', count: 3, active: true },
    { name: 'Images', count: 7, active: false }
  ]}
  onProjectNameChange={(name) => console.log('New name:', name)}
  onLevelClick={(index) => console.log('Clicked level:', index)}
/>
```

### Breadcrumb.svelte

Breadcrumb navigation component for hierarchical navigation.

**Features:**
- Clickable breadcrumb segments
- Visual separators (chevron arrows)
- Active/last item styling
- Horizontal scroll for long paths

**Props:**
```typescript
interface Props {
  breadcrumbs: BreadcrumbItem[]
}

interface BreadcrumbItem {
  label: string
  onclick?: () => void  // Optional - makes item clickable
}
```

**Usage:**
```svelte
<Breadcrumb
  breadcrumbs={[
    { label: 'Film', onclick: () => navigateToFilm() },
    { label: 'Block 1', onclick: () => navigateToBlock(1) },
    { label: 'Scene 3', onclick: () => navigateToScene(3) },
    { label: 'Shots' } // Last item, not clickable
  ]}
/>
```

## Styling

All components use a dark theme with:
- Background: `#0a0a0a` (toolbar/sidebar), `#000` (content)
- Text: `rgba(255, 255, 255, 0.9)` (primary), `rgba(255, 255, 255, 0.6)` (secondary)
- Borders: `rgba(255, 255, 255, 0.08)` (subtle), `rgba(255, 255, 255, 0.15)` (emphasized)
- Hover states: `rgba(255, 255, 255, 0.08)` background
- Transitions: `0.15s` for smooth interactions

## Type Safety

All components are fully typed with TypeScript:
- Use Svelte 5 `$props()` runes
- Export types for Level and BreadcrumbItem
- Proper event handler typing

## Integration with SheetState

The Toolbar component imports `THUMBNAIL_SIZES` from `SheetState.svelte.ts`:
```typescript
import { THUMBNAIL_SIZES } from '../sheet/SheetState.svelte.ts'
```

Ensure this constant is exported from your SheetState file.

## Example: Full Integration

```svelte
<script lang="ts">
  import { AppLayout } from '$lib/app'
  import type { Level, BreadcrumbItem } from '$lib/app'
  import { SheetState } from '$lib/sheet/SheetState.svelte.ts'

  const state = new SheetState()

  const levels: Level[] = [
    { name: 'Film', count: 0, active: false },
    { name: 'Blocks', count: 0, active: false },
    { name: 'Scenes', count: 0, active: false },
    { name: 'Shots', count: state.cols.length, active: true },
    { name: 'Images', count: state.cardsMetadata.size, active: false }
  ]

  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Film', onclick: () => console.log('Film') },
    { label: 'Shots' }
  ]
</script>

<AppLayout
  selectedThumbnailSize={state.selectedThumbnailSize}
  showThumbnailMenu={state.showThumbnailMenu}
  isSoundMuted={state.isSoundMuted}
  stickyTopRow={state.stickyTopRow}
  openEllipsisMenu={state.openEllipsisMenu}
  onUndo={handleUndo}
  onRedo={handleRedo}
  onRegenerate={handleRegenerate}
  onToggleThumbnailMenu={() => state.showThumbnailMenu = !state.showThumbnailMenu}
  onSelectThumbnailSize={(i) => state.selectedThumbnailSize = i}
  onToggleSound={() => state.isSoundMuted = !state.isSoundMuted}
  onToggleStickyTopRow={() => state.stickyTopRow = !state.stickyTopRow}
  onToggleEllipsisMenu={(id) => state.openEllipsisMenu = state.openEllipsisMenu === id ? null : id}
  projectName="Mystic Lake"
  {levels}
  {breadcrumbs}
>
  <!-- Your sheet grid or other content -->
  <SheetGrid {...gridProps} />
</AppLayout>
```

## Files

- `AppLayout.svelte` - Main layout composer (3.5 KB)
- `Toolbar.svelte` - Top toolbar with all controls (11 KB)
- `LevelsBar.svelte` - Left sidebar navigation (3 KB)
- `Breadcrumb.svelte` - Breadcrumb navigation (2.9 KB)
- `index.ts` - Barrel export file (617 B)
- `README.md` - This documentation

Total: ~21 KB of well-organized, reusable UI components
