# Work Order: Nanosheet Transpose Feature

## Overview
Generalize nanosheet to support both **column-major (vertical)** and **row-major (horizontal)** orientations using a time/lanes abstraction.

## Status
- ✅ **Phase 1 Complete**: Time/lanes abstraction implemented and deployed
- ⏳ **Phase 2 Pending**: Modularization (updated with Phase 1 learnings)
- ⏳ **Phase 3 Pending**: Horizontal orientation (depends on Phase 2)

## Current Architecture (After Phase 1)
- **Model**: `ySheet.ts` with `rowOrder`, `colOrder`, `cells` (sparse matrix like Excel R1C1) - **unchanged**
- **View**: `frontend/src/routes/+page.svelte` (4,648 lines after Phase 1)
- **Orientation**: Column-major only (time flows down), but with time/lanes abstraction ready
- **Deployment**: https://nanosheet.fly.dev

## Target Architecture
- **Model**: Unchanged (symmetric, orientation-agnostic) ✅
- **View**: Modular components with time/lanes abstraction ⏳
- **Orientation**: Toggle between vertical/horizontal ⏳
- **User Control**: Toggle button + localStorage persistence ⏳

## Key Learnings from Phase 1

### What Worked Well ✅
1. **Time/lanes abstraction is sound**: `cellKey()` and `parseCellKey()` cleanly handle orientation swapping
2. **FLIP animations**: Svelte's `animate:flip` provides smooth column reordering (300ms)
3. **Drag cursor positioning**: Centering cursor vertically on column preview fixes drop detection
4. **WebSocket reconnection**: Max retries (10) + exponential backoff prevents infinite loops
5. **Yjs persistence**: Adding `cardsMetadata` observer ensures all data is saved

### Issues Found ⚠️
1. **Non-reactive state**: Svelte compiler warned about `draggedCard`, `draggedColumn`, refs not using `$state()`
2. **Event propagation complexity**: Column drops required handlers on indicators, columns, AND cards
3. **Display: contents required**: Wrapper divs for `animate:flip` need `display: contents` to avoid layout breaks
4. **Frozen row detection**: Initially checked wrong axis (lanes vs timeline)

### Phase 2 Updates
- Added `SheetColumn.svelte` component (wasn't in original plan)
- Emphasized `$state()` requirement for ALL mutable state
- Added priority order for component extraction (easiest → hardest)
- Included specific line numbers and code snippets from Phase 1 work
- Added `ToastNotification.svelte` to component list
- Clarified that refs (`frozenRowRef`, etc.) also need `$state()`

### Phase 3 Updates
- Added conditional rendering approach (don't reuse DOM structure)
- Noted that drag/drop is mostly orientation-agnostic thanks to Phase 1
- Added Material Icons for toggle button (`swap_vert`/`swap_horiz`)
- Emphasized that FLIP animations work automatically in both orientations
- Added specific CSS changes needed for horizontal mode

---

## Phase 1: Introduce Time/Lanes Abstraction
**Branch**: `feat/time-lanes-abstraction` (created)
**File**: `frontend/src/routes/+page.svelte`
**Goal**: Add abstraction layer with NO behavioral change (vertical-only, hardcoded)

### Tasks
1. **Add abstraction types and state** (after line 33, after `shotTitles` declaration):
   ```typescript
   // ============================================================================
   // TIME/LANES ABSTRACTION
   // ============================================================================
   // Orientation: 'vertical' = column-major (time flows down), 'horizontal' = row-major (time flows right)
   type Orientation = 'vertical' | 'horizontal'
   let orientation: Orientation = 'vertical'  // Hardcoded to vertical for Phase 1

   // Semantic mapping: which axis represents time flow, which represents parallel lanes
   let timeline = $derived(orientation === 'vertical' ? rows : cols)
   let lanes = $derived(orientation === 'vertical' ? cols : rows)

   // The first lane is the fixed header (first column in vertical, first row in horizontal)
   let fixedLane = $derived(lanes.length > 0 ? lanes[0] : null)

   // Helper: Construct cell key from semantic time/lane IDs
   function cellKey(timeId: string, laneId: string): string {
     return orientation === 'vertical'
       ? `${timeId}:${laneId}`   // vertical: row:col
       : `${laneId}:${timeId}`   // horizontal: col:row (swapped)
   }

   // Helper: Parse cell key into semantic time/lane IDs
   function parseCellKey(key: string): { timeId: string; laneId: string } {
     const [a, b] = key.split(':')
     return orientation === 'vertical'
       ? { timeId: a, laneId: b }      // vertical: a=row=time, b=col=lane
       : { timeId: b, laneId: a }      // horizontal: a=col=lane, b=row=time
   }
   // ============================================================================
   ```

2. **Update drag state types** to use time/lanes semantics:
   - Change `draggedCard` from `{ rowId, colId, cardId }` to `{ timeId, laneId, cardId }`
   - Change `dragPreview` from `{ targetCol, targetRow, insertBefore }` to `{ targetLane, targetTime, insertBefore }`

3. **Update all drag/drop handlers** to use time/lanes:
   - `handleDragStart()` - use timeId/laneId parameters
   - `handleDragOver()` - use timeId/laneId parameters
   - `handleDrop()` - use time/lane semantics, call `cellKey()`
   - Update shift logic to iterate over `timeline` within a `lane`

4. **Update column operations** to use lane semantics:
   - Rename "column drag" to "lane drag" conceptually
   - `handleColumnDragStart()` → works on lanes
   - `handleColumnDrop()` → works on lanes
   - `deleteColumn()` → `deleteLane()` semantically (keep function name for now)

5. **Update undo/redo operations**:
   - Use `cellKey()` and `parseCellKey()` for all cell key construction/parsing
   - Shift operations use `timeline` and `lanes` instead of direct row/col

6. **Update render logic**:
   - Grid iteration: use `timeline` and `lanes` instead of `displayRows`/`displayCols` where appropriate
   - Cell key lookups: use `cellKey(timeId, laneId)`

### Success Criteria
- [x] App runs without errors
- [x] All existing functionality works identically (vertical mode only)
- [x] No visual or behavioral changes
- [x] Drag and drop works as before
- [x] Undo/redo works as before
- [x] Column operations work as before

### Testing Checklist
- [x] Load sheet with existing data
- [x] Drag cards within columns (vertically)
- [x] Drag columns horizontally
- [x] Delete cards
- [x] Undo card operations
- [x] Redo card operations
- [x] Upload media to cells
- [x] Edit card in modal
- [ ] Regenerate sheet (not tested yet)

**Phase 1 Complete**: ✅ Deployed to https://nanosheet.fly.dev

### Commit Message
```
feat: Introduce time/lanes abstraction for future orientation support

- Add Orientation type and orientation state (hardcoded to 'vertical')
- Add derived timeline/lanes from rows/cols
- Add cellKey() and parseCellKey() helpers
- Refactor drag/drop logic to use time/lanes semantics
- Refactor undo/redo to use time/lanes semantics
- No behavioral change - purely internal abstraction layer

This prepares the codebase for adding horizontal/row-major orientation
support in future phases.
```

---

## Phase 2: Refactor Into Modules
**Branch**: `refactor/modular-sheet` (create from feat/time-lanes-abstraction)
**Goal**: Extract +page.svelte (~4,600 lines) into modular components (vertical-only still)
**Current Size**: 4,648 lines after Phase 1 changes

### New File Structure
```
frontend/src/lib/
├── sheet/
│   ├── types.ts                // TypeScript interfaces (Orientation, drag state, etc.)
│   ├── SheetLayout.ts          // Time/lanes abstraction & helpers
│   ├── SheetState.svelte.ts    // State management (runes) - CRITICAL: use $state properly
│   └── SheetOperations.ts      // Undo/redo, drag/drop logic
├── components/
│   ├── SheetGrid.svelte        // Main grid rendering (frozen row + scrollable columns)
│   ├── SheetColumn.svelte      // Individual column/lane component
│   ├── SheetCard.svelte        // Individual card component
│   ├── CardModal.svelte        // Modal for editing cards
│   ├── ConfirmDialog.svelte    // Confirmation dialogs
│   └── ToastNotification.svelte // Toast notifications
└── ySheet.ts                   // (existing - unchanged)
```

### Tasks

#### 1. Create Type Definitions
**File**: `frontend/src/lib/sheet/types.ts`
```typescript
export type Orientation = 'vertical' | 'horizontal'
export type ThumbnailSize = 'small' | 'medium' | 'large'

export interface DraggedCard {
  timeId: string
  laneId: string
  cardId: string
}

export interface DragPreview {
  targetLane: string
  targetTime: string
  insertBefore: boolean
}

export interface ColumnDragPreview {
  targetColIndex: number
  insertBefore: boolean
}

export interface UndoOperation {
  type: 'delete' | 'insert' | 'move'
  cardId: string
  fromTimeId: string
  fromLaneId: string
  toTimeId?: string
  toLaneId?: string
}

export interface Card {
  title: string
  color: string
  thumb_url?: string
  media_url?: string
  media_type?: 'image' | 'video'
  isLoading?: boolean
}
```

#### 2. Create Layout Abstraction
**File**: `frontend/src/lib/sheet/SheetLayout.ts`
```typescript
import type { Orientation } from './types'

export class SheetLayout {
  constructor(
    public orientation: Orientation,
    public rows: string[],
    public cols: string[]
  ) {}

  get timeline(): string[] {
    return this.orientation === 'vertical' ? this.rows : this.cols
  }

  get lanes(): string[] {
    return this.orientation === 'vertical' ? this.cols : this.rows
  }

  get fixedLane(): string | null {
    return this.lanes.length > 0 ? this.lanes[0] : null
  }

  cellKey(timeId: string, laneId: string): string {
    return this.orientation === 'vertical'
      ? `${timeId}:${laneId}`
      : `${laneId}:${timeId}`
  }

  parseCellKey(key: string): { timeId: string; laneId: string } {
    const [a, b] = key.split(':')
    return this.orientation === 'vertical'
      ? { timeId: a, laneId: b }
      : { timeId: b, laneId: a }
  }
}
```

#### 3. Extract Components (Priority Order)

**3.1. Create `ToastNotification.svelte`** (easiest, no dependencies)
- Extract toast state and rendering
- Props: `message`, `duration`, `onClose`

**3.2. Create `ConfirmDialog.svelte`** (simple, clear boundaries)
- Extract confirmation dialog logic
- Props: `show`, `message`, `onConfirm`, `onCancel`

**3.3. Create `CardModal.svelte`** (large but self-contained)
- Extract entire modal (lines ~2940-3100)
- Props: `show`, `card`, `cardId`, `onClose`, `onSave`, `onDelete`
- Include canvas drawing logic
- Include attachments gallery
- **IMPORTANT**: Handle Yjs Y.Text for collaborative prompt editing

**3.4. Create `SheetCard.svelte`** (reusable card component)
- Extract card rendering logic
- Props: `card`, `size`, `isDragging`, `isColumnDrag`, callbacks
- Include drag/drop event handlers
- Handle video media via VideoMedia component
- **LEARNING**: Keep event handlers in component, pass callbacks up

**3.5. Create `SheetColumn.svelte`** (column/lane wrapper)
- Wraps multiple SheetCard components
- Handles column-level drag/drop
- Props: `laneId`, `cards`, `size`, `isDragging`, callbacks
- **LEARNING**: Include column drop indicators here
- **LEARNING**: Use `animate:flip` for smooth reordering

**3.6. Create `SheetGrid.svelte`** (main grid layout)
- Frozen row section
- Scrollable columns section
- Renders multiple `SheetColumn` components
- **LEARNING**: Must handle scroll sync between frozen/scrollable
- **LEARNING**: Column-wrapper with `display: contents` for animations

#### 4. State Management (CRITICAL)
**File**: `frontend/src/lib/sheet/SheetState.svelte.ts`

**IMPORTANT LESSONS FROM PHASE 1**:
- ⚠️ Svelte compiler warned about non-reactive updates to `draggedCard`, `draggedColumn`, refs
- Must use `$state()` for ALL mutable state
- Use `$derived()` for computed values
- Don't mix plain `let` with `$state` updates

```typescript
import { SheetLayout } from './SheetLayout'
import type { DraggedCard, DragPreview, ColumnDragPreview } from './types'

export class SheetState {
  // Yjs connection
  sheet = $state<SheetConnection | null>(null)

  // Reactive state (MUST use $state)
  rows = $state<string[]>([])
  cols = $state<string[]>([])
  cellsMap = $state<Map<string, any>>(new Map())
  cardsMetadata = $state<Map<string, any>>(new Map())

  // Drag state (MUST use $state)
  draggedCard = $state<DraggedCard | null>(null)
  dragPreview = $state<DragPreview | null>(null)
  draggedColumn = $state<string | null>(null)
  columnDragPreview = $state<ColumnDragPreview | null>(null)
  isColumnDragging = $state(false)
  isDragging = $state(false)

  // UI state
  selectedThumbnailSize = $state<ThumbnailSize>('medium')
  stickyTopRow = $state(true)
  loading = $state(true)

  // Derived layout
  layout = $derived(new SheetLayout('vertical', this.rows, this.cols))
  displayCols = $derived([...this.cols, `phantom-col-${this.cols.length}`])
  displayRows = $derived([...this.rows, `phantom-row-${this.rows.length}`])
}
```

#### 5. Operations Module
**File**: `frontend/src/lib/sheet/SheetOperations.ts`

Extract pure functions for:
- `handleCardDragStart()`
- `handleCardDragOver()`
- `handleCardDrop()`
- `handleColumnDragStart()`
- `handleColumnDragOver()`
- `handleColumnDrop()`
- `performUndo()`
- `performRedo()`

**LEARNING**: Keep event handlers in components, extract business logic here

#### 6. Update Main Page
**File**: `frontend/src/routes/+page.svelte`

Target: ~500-800 lines (down from 4,648)
- Import modules
- Initialize state
- Yjs connection setup
- Render `<SheetGrid>` with props
- Render modals conditionally
- **CRITICAL**: Fix non-reactive state warnings from Phase 1

### Success Criteria
- [ ] App runs without errors
- [ ] All existing functionality works identically
- [ ] No visual or behavioral changes
- [ ] Code is more maintainable and modular
- [ ] Each module has single responsibility

### Testing Checklist
Same as Phase 1 - ensure no regressions

### Commit Message
```
refactor: Extract +page.svelte into modular components

- Create SheetLayout class for time/lanes abstraction
- Create SheetState class for state management
- Create SheetOperations module for business logic
- Extract CardModal, SheetCard, SheetGrid components
- Reduce +page.svelte to orchestration layer

No behavioral changes - purely structural refactoring.
```

---

## Phase 3: Add Horizontal Orientation Support
**Branch**: `feat/horizontal-orientation` (create from main after Phase 2 merged)
**Goal**: Enable row-major mode with orientation toggle
**Prerequisites**: Phase 2 modularization must be complete

### Tasks

#### 1. Update State for Dynamic Orientation
**File**: `frontend/src/lib/sheet/SheetState.svelte.ts`
```typescript
// Change from hardcoded to reactive
orientation = $state<Orientation>('vertical')  // User can change this

// Layout becomes reactive to orientation changes
layout = $derived(new SheetLayout(this.orientation, this.rows, this.cols))
```

#### 2. Add Orientation Toggle UI
**File**: `frontend/src/routes/+page.svelte`

Add toggle button in header:
```svelte
<div class="orientation-toggle">
  <button
    class="icon-btn"
    onclick={() => state.orientation = state.orientation === 'vertical' ? 'horizontal' : 'vertical'}
    title="Toggle orientation"
  >
    <span class="material-symbols-outlined">
      {state.orientation === 'vertical' ? 'swap_vert' : 'swap_horiz'}
    </span>
    {state.orientation === 'vertical' ? 'Vertical' : 'Horizontal'}
  </button>
</div>
```

#### 3. Update CSS for Horizontal Mode
**File**: `frontend/src/lib/components/SheetGrid.svelte`

**CRITICAL LEARNINGS**:
- Use flexbox for columns (already working in vertical)
- For horizontal: rotate the layout conceptually
- Frozen "row" becomes frozen "column" (left sticky)
- Scrollable "columns" become scrollable "rows"

```css
/* Vertical mode (default) */
.sheet-grid.vertical {
  /* Already working */
}

/* Horizontal mode */
.sheet-grid.horizontal .frozen-row {
  /* Becomes left sticky column */
  flex-direction: column;
  width: 200px; /* Fixed width instead of full width */
  height: 100%;
  border-right: 2px solid rgba(255, 255, 255, 0.15);
  border-bottom: none;
  overflow-y: auto;
  overflow-x: visible;
}

.sheet-grid.horizontal .columns-container {
  /* Rows of cards flowing right */
  flex-direction: column; /* Stack rows vertically */
  overflow-y: auto; /* Vertical scroll for rows */
  overflow-x: auto; /* Horizontal scroll for time */
}

.sheet-grid.horizontal .column {
  /* Becomes a row */
  flex-direction: row; /* Cards flow right instead of down */
  width: auto;
  height: auto;
}
```

#### 4. Update SheetGrid Rendering Logic
**File**: `frontend/src/lib/components/SheetGrid.svelte`

Add conditional rendering:
```svelte
<div class="sheet-grid {layout.orientation}">
  {#if layout.orientation === 'vertical'}
    <!-- Existing vertical layout -->
    <div class="frozen-row">...</div>
    <div class="columns-container">...</div>
  {:else}
    <!-- New horizontal layout -->
    <div class="frozen-column">...</div>
    <div class="rows-container">...</div>
  {/if}
</div>
```

**LEARNING**: Don't try to reuse the same DOM structure - conditionally render different layouts

#### 5. Update Drag/Drop for Horizontal
**Files**: `SheetCard.svelte`, `SheetColumn.svelte`

**Key changes**:
- Drag preview cursor offset: horizontal center instead of vertical center
- Drop indicators: show left/right instead of top/bottom
- Shift logic: already works via time/lanes abstraction!

**LEARNING**: The time/lanes abstraction from Phase 1 means drag/drop logic is mostly orientation-agnostic

#### 6. Add Persistence and Initialization
**File**: `frontend/src/routes/+page.svelte`

```typescript
onMount(() => {
  // Load saved orientation preference
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('orientation')
    if (saved === 'horizontal' || saved === 'vertical') {
      state.orientation = saved
    }
  }
})

// Save orientation changes
$effect(() => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('orientation', state.orientation)
  }
})
```

#### 7. Update Animation for Horizontal
**File**: `frontend/src/lib/components/SheetColumn.svelte`

**LEARNING**: `animate:flip` works in both directions automatically!
- Just ensure the wrapper has `display: contents`
- Svelte calculates FLIP animation based on actual position changes

### Success Criteria
- [ ] Toggle switches between vertical and horizontal
- [ ] Vertical mode: time flows down, lanes are columns, works as before
- [ ] Horizontal mode: time flows right, lanes are rows, drag/drop works correctly
- [ ] Undo/redo works in both orientations
- [ ] Preference persists across page reloads

### Testing Checklist (Both Orientations)
**Vertical Mode**:
- [ ] Drag cards within columns (down)
- [ ] Drag columns horizontally
- [ ] Delete/undo/redo works

**Horizontal Mode**:
- [ ] Drag cards within rows (right)
- [ ] Drag rows vertically
- [ ] Delete/undo/redo works
- [ ] Switch orientation with existing data - layout updates correctly

### Commit Message
```
feat: Add horizontal/row-major orientation support

- Make orientation toggleable (vertical/horizontal)
- Add orientation toggle UI button
- Update CSS for horizontal grid layout
- Update fixed header for horizontal mode (sticky left column)
- Add localStorage persistence for orientation preference

Users can now toggle between:
- Vertical: time flows down, lanes are columns (column-major)
- Horizontal: time flows right, lanes are rows (row-major)
```

---

## Session Instructions

### To execute Phase 1:
```
Please execute Phase 1 of the work order in TRANSPOSE_WORK_ORDER.md
```

### To execute Phase 2:
```
Please execute Phase 2 of the work order in TRANSPOSE_WORK_ORDER.md
```

### To execute Phase 3:
```
Please execute Phase 3 of the work order in TRANSPOSE_WORK_ORDER.md
```

---

## Notes
- Each phase is independently valuable and can be shipped
- Model (`ySheet.ts`) never changes - stays orientation-agnostic
- Test thoroughly between phases before proceeding
- Update this work order if requirements change
