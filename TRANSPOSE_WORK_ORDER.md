# Work Order: Nanosheet Transpose Feature

## Overview
Generalize nanosheet to support both **column-major (vertical)** and **row-major (horizontal)** orientations using a time/lanes abstraction.

## Status
- ✅ **Phase 1 Complete**: Time/lanes abstraction implemented and deployed
- ✅ **Phase 2 Complete**: Modularization with Strategy Pattern architecture
- ⏳ **Phase 3 Ready**: Horizontal orientation (updated with Phase 1 & 2 learnings)

## Current Architecture (After Phase 2)
- **Model**: `ySheet.ts` with `rowOrder`, `colOrder`, `cells` (sparse matrix) - **unchanged**
- **View**: Modular component architecture with SheetGrid, SheetColumn, SheetCard
- **State**: Centralized in `SheetState.svelte.ts` with proper `$state()` runes
- **Operations**: Extracted into CardOperations, DragOperations, UndoRedoOperations, ColumnOperations classes
- **Strategies**: OrientationStrategy (VerticalOrientation, HorizontalOrientation placeholder)
- **Orientation**: Vertical only (HorizontalOrientation exists but throws error)
- **Deployment**: https://nanosheet.fly.dev

## Target Architecture
- **Model**: Unchanged (symmetric, orientation-agnostic) ✅
- **View**: Modular components with time/lanes abstraction ✅
- **Orientation**: Toggle between vertical/horizontal ⏳
- **User Control**: Toggle button in toolbar + localStorage persistence ⏳

## Key Learnings from Phase 1 & 2

### Phase 1 Learnings ✅
1. **Time/lanes abstraction is sound**: Strategy pattern works perfectly
2. **FLIP animations**: Svelte's `animate:flip` provides smooth reordering (300ms)
3. **Drag cursor positioning**: Centering cursor vertically on column preview fixes drop detection
4. **Yjs persistence**: Nested Y.Maps with observeDeep() for granular field updates

### Phase 2 Learnings ✅
1. **Strategy Pattern**: OrientationStrategy cleanly separates vertical/horizontal logic
2. **Operations Classes**: CardOperations, DragOperations, ColumnOperations, UndoRedoOperations work well
3. **SheetState**: Centralized reactive state with `$state()` and `$derived()` runes
4. **Component Hierarchy**: SheetGrid → SheetColumn → SheetCard works cleanly
5. **App Shell**: Toolbar, AppLayout, LevelsBar, Breadcrumb extracted successfully
6. **Frozen Row Scroll**: Wheel event propagation needed for vertical scroll on frozen row

### What Actually Exists (Phase 2 Complete)
```
frontend/src/lib/
├── app/
│   ├── AppLayout.svelte        ✅ Top-level layout shell
│   ├── Toolbar.svelte          ✅ With orientation toggle UI (vertical/horizontal buttons)
│   ├── LevelsBar.svelte        ✅ Left sidebar navigation
│   └── Breadcrumb.svelte       ✅ Navigation breadcrumbs
├── sheet/
│   ├── SheetState.svelte.ts    ✅ Centralized state with $state runes
│   ├── operations/
│   │   ├── CardOperations.ts       ✅ Card CRUD, edit, delete
│   │   ├── DragOperations.ts       ✅ Card drag/drop within grid
│   │   ├── ColumnOperations.ts     ✅ Lane operations (delete, duplicate, download)
│   │   ├── ColumnDragOperations.ts ✅ Lane drag/drop reordering
│   │   └── UndoRedoOperations.ts   ✅ Undo/redo stack management
│   ├── strategies/
│   │   └── orientation/
│   │       ├── OrientationStrategy.ts      ✅ Abstract strategy interface
│   │       ├── VerticalOrientation.ts      ✅ Fully implemented
│   │       └── HorizontalOrientation.ts    ⚠️ Skeleton (throws error)
│   └── types.ts                ✅ TypeScript interfaces
├── components/
│   ├── SheetGrid.svelte        ✅ Main grid with frozen row
│   ├── SheetColumn.svelte      ✅ Individual column/lane
│   ├── SheetCard.svelte        ✅ Individual card
│   ├── CardModal.svelte        ✅ Edit modal with canvas
│   ├── CardContextMenu.svelte  ✅ Right-click menu
│   ├── ConfirmDialog.svelte    ✅ Confirmation dialogs
│   └── ToastNotification.svelte ✅ Toast notifications
└── ySheet.ts                   ✅ Yjs connection (unchanged)
```

### Phase 2 Achievements
- **Reduced +page.svelte**: From 4,648 lines → ~730 lines
- **Proper Reactivity**: All state uses `$state()`, `$derived()`, `$effect()`
- **Clean Separation**: Operations, strategies, components all separated
- **Orientation Toggle UI**: Already exists in Toolbar.svelte (lines 120-148)
- **Error Handling**: Orientation change wrapped in try-catch with toast

---

## Phase 3: Implement Horizontal Orientation
**Branch**: `feat/horizontal-orientation` (create from `feat/time-lanes-abstraction`)
**Goal**: Complete HorizontalOrientation strategy implementation
**Prerequisites**: Phase 1 & 2 complete ✅

### Current State Assessment

#### What Already Works ✅
1. **UI Toggle**: Toolbar has vertical/horizontal toggle buttons with custom SVG icons
2. **State Management**: `SheetState.orientation` is reactive with `$state()`
3. **Strategy Pattern**: OrientationStrategy interface defined
4. **Vertical Implementation**: VerticalOrientation fully working
5. **Error Handling**: Toast shows "Horizontal orientation not yet implemented"
6. **Operations**: All operations use `this.strategy.cellKey()` and `this.strategy.timeline()/lanes()`

#### What Needs Implementation ⏳
1. **HorizontalOrientation Strategy**: Complete the implementation
2. **SheetGrid Horizontal Layout**: Conditional rendering for horizontal mode
3. **CSS for Horizontal**: Styles for frozen column (left) + scrollable rows
4. **Drag Preview Positioning**: Adjust cursor centering for horizontal
5. **localStorage Persistence**: Already exists via `state.savePreference()`

### Tasks

#### 1. Implement HorizontalOrientation Strategy
**File**: `frontend/src/lib/sheet/strategies/orientation/HorizontalOrientation.ts`

**Current State** (skeleton):
```typescript
export class HorizontalOrientation implements OrientationStrategy {
  readonly name = 'horizontal'

  cellKey(time: string, lane: string): string {
    throw new Error('Horizontal orientation not yet implemented')
  }

  parseCellKey(key: string): { time: string; lane: string } {
    throw new Error('Horizontal orientation not yet implemented')
  }

  timeline(rows: string[], cols: string[]): string[] {
    throw new Error('Horizontal orientation not yet implemented')
  }

  lanes(rows: string[], cols: string[]): string[] {
    throw new Error('Horizontal orientation not yet implemented')
  }
}
```

**Implementation**:
```typescript
import type { OrientationStrategy } from './OrientationStrategy'

/**
 * Horizontal Orientation Strategy
 *
 * Time flows RIGHT (along columns)
 * Lanes are ROWS (vertical)
 *
 * Visual:
 *        c-0   c-1   c-2   c-3  (time →)
 * r-0   [  ]  [  ]  [  ]  [  ]  (lane)
 * r-1   [  ]  [  ]  [  ]  [  ]  (lane)
 * r-2   [  ]  [  ]  [  ]  [  ]  (lane)
 *
 * Cell keys: "r-0:c-1" (lane:time, row:col)
 */
export class HorizontalOrientation implements OrientationStrategy {
  readonly name = 'horizontal'

  /**
   * Construct cell key: lane:time (row:col)
   *
   * @param time - Timeline position (column ID in horizontal)
   * @param lane - Lane position (row ID in horizontal)
   * @returns Cell key in format "row:col"
   */
  cellKey(time: string, lane: string): string {
    return `${lane}:${time}`  // row:col
  }

  /**
   * Parse cell key: "row:col" → { time: col, lane: row }
   *
   * @param key - Cell key in format "row:col"
   * @returns Parsed time and lane IDs
   */
  parseCellKey(key: string): { time: string; lane: string } {
    const [row, col] = key.split(':')
    return { time: col, lane: row }  // time=col, lane=row
  }

  /**
   * Timeline is columns (time flows right)
   */
  timeline(rows: string[], cols: string[]): string[] {
    return cols
  }

  /**
   * Lanes are rows (parallel vertical lanes)
   */
  lanes(rows: string[], cols: string[]): string[] {
    return rows
  }
}
```

**Key Points**:
- In horizontal mode: time = columns, lanes = rows
- Cell key format: `"row:col"` (lane:time)
- Mirrors VerticalOrientation logic but swapped

#### 2. Update SheetGrid for Horizontal Layout
**File**: `frontend/src/lib/components/SheetGrid.svelte`

**Add Conditional Rendering**:
```svelte
<script lang="ts">
  // ... existing props ...
  export let orientation: 'vertical' | 'horizontal'

  // ... existing code ...
</script>

<div class="sheet-view {orientation}">
  {#if orientation === 'vertical'}
    <!-- EXISTING: Frozen header row (top) + scrollable columns (below) -->
    {#if stickyTopRow}
    <div
      bind:this={frozenRowRef}
      class="frozen-row"
      style="gap: {gap}px"
      onscroll={onSyncColumnsScroll}
      onwheel={handleFrozenRowWheel}
    >
      <!-- Existing frozen row content -->
    </div>
    {/if}

    <div
      bind:this={columnsContainerRef}
      class="columns-container"
      style="gap: {gap}px"
      onscroll={onSyncColumnsScroll}
    >
      <!-- Existing columns content -->
    </div>

  {:else}
    <!-- NEW: Frozen header column (left) + scrollable rows (right) -->
    <div class="horizontal-layout">
      {#if stickyTopRow}
      <div
        bind:this={frozenColumnRef}
        class="frozen-column"
        style="gap: {gap}px"
        onscroll={onSyncRowsScroll}
        onwheel={handleFrozenColumnWheel}
      >
        <!-- Frozen column: first row (header cards stacked vertically) -->
        {#each displayRows as rowId (rowId)}
          {@const firstColId = timeline[0]}
          {@const key = cellKey(firstColId, rowId)}
          {@const cell = cellsMap.get(key)}
          {@const card = cell?.cardId ? cardsMetadata.get(cell.cardId) : null}

          {#if card}
            <div class="shot-header-card" style="width: {thumbnailSize.width}px; height: {thumbnailSize.height}px">
              <!-- Header card rendering (similar to existing frozen row) -->
            </div>
          {/if}
        {/each}
      </div>
      {/if}

      <div
        bind:this={rowsContainerRef}
        class="rows-container"
        style="gap: {gap}px"
        onscroll={onSyncRowsScroll}
      >
        <!-- Rows: iterate displayRows, each row flows right -->
        {#each displayRows as rowId (rowId)}
          <div class="row" style="gap: {gap}px">
            {#each displayCols as colId (colId)}
              {@const key = cellKey(colId, rowId)}
              {@const cell = cellsMap.get(key)}
              {@const card = cell?.cardId ? cardsMetadata.get(cell.cardId) : null}

              {#if card}
                <SheetCard
                  {card}
                  {thumbnailSize}
                  isDragging={draggedCard?.cardId === card.cardId}
                  onDragStart={(e) => onDragStart(e, colId, rowId, card.cardId)}
                  onDragOver={(e) => onDragOver(e, colId, rowId, e.currentTarget)}
                  onDrop={(e) => onDrop(e, colId, rowId)}
                  onDragEnd={onDragEnd}
                  onDoubleClick={() => onCardDoubleClick(card.cardId)}
                  onDelete={() => onDeleteCard(colId, rowId)}
                  onTitleInput={(value) => onCardTitleInput(card.cardId, value)}
                  onTitleChange={(value) => onCardTitleChange(card.cardId, value)}
                  onContextMenu={(e) => onCardContextMenu(e, card.cardId)}
                />
              {:else}
                <!-- Empty cell for drops -->
                <div
                  class="empty-cell"
                  style="width: {thumbnailSize.width}px; height: {thumbnailSize.height}px"
                  ondragover={(e) => onDragOver(e, colId, rowId, e.currentTarget)}
                  ondrop={(e) => onDrop(e, colId, rowId)}
                />
              {/if}
            {/each}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
```

**Add Helper Functions**:
```typescript
function handleFrozenColumnWheel(e: WheelEvent) {
  if (rowsContainerRef && Math.abs(e.deltaX) > 0) {
    e.preventDefault()
    rowsContainerRef.scrollLeft += e.deltaX
  }
}

function onSyncRowsScroll(e: Event) {
  const target = e.target as HTMLElement
  if (rowsContainerRef && target !== rowsContainerRef) {
    rowsContainerRef.scrollLeft = target.scrollLeft
  }
  if (frozenColumnRef && target !== frozenColumnRef) {
    frozenColumnRef.scrollTop = target.scrollTop
  }
}
```

#### 3. Add CSS for Horizontal Mode
**File**: `frontend/src/lib/components/SheetGrid.svelte` (styles)

```css
/* Horizontal mode layout */
.sheet-view.horizontal {
  display: flex;
  flex-direction: row; /* Side by side instead of stacked */
  height: 100%;
}

.horizontal-layout {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* Frozen column (left sticky) */
.frozen-column {
  display: flex;
  flex-direction: column; /* Cards stacked vertically */
  padding-right: 2.5rem;
  border-right: 2px solid rgba(255, 255, 255, 0.15);
  margin-right: 2.5rem;
  overflow-y: auto; /* Vertical scroll for lanes */
  overflow-x: visible;
  scrollbar-width: none;
  -ms-overflow-style: none;
  flex-shrink: 0;
}

.frozen-column::-webkit-scrollbar {
  display: none;
}

/* Rows container (scrollable right) */
.rows-container {
  flex: 1;
  overflow-x: auto; /* Horizontal scroll for time */
  overflow-y: auto; /* Vertical scroll for lanes */
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* Individual row (flows right) */
.row {
  display: flex;
  flex-direction: row; /* Cards flow horizontally */
  flex-shrink: 0;
}

.empty-cell {
  flex-shrink: 0;
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}
```

#### 4. Update Drag Preview for Horizontal
**File**: `frontend/src/lib/sheet/operations/DragOperations.ts`

**Add orientation-aware cursor positioning**:
```typescript
handleDragStart(e: DragEvent, time: string, lane: string, cardId: string): void {
  // ... existing code ...

  const orientation = this.getOrientation()

  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    const target = e.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()

    // Center cursor on preview based on orientation
    if (orientation === 'vertical') {
      // Vertical: center vertically, keep horizontal offset
      const offsetY = rect.height / 2
      e.dataTransfer.setDragImage(target, e.clientX - rect.left, offsetY)
    } else {
      // Horizontal: center horizontally, keep vertical offset
      const offsetX = rect.width / 2
      e.dataTransfer.setDragImage(target, offsetX, e.clientY - rect.top)
    }
  }

  // ... rest of existing code ...
}
```

#### 5. Update Lane Drag for Horizontal
**File**: `frontend/src/lib/sheet/operations/ColumnDragOperations.ts`

**Add orientation-aware lane dragging**:
- In vertical: drag columns left/right (horizontal reordering)
- In horizontal: drag rows up/down (vertical reordering)

```typescript
handleColumnDragOver(e: DragEvent, colId: string): void {
  e.preventDefault()
  if (!this.state.draggedColumn) return

  const orientation = this.getOrientation()
  const cols = this.getCols()
  const draggedIndex = cols.indexOf(this.state.draggedColumn)
  const targetIndex = cols.indexOf(colId)

  if (draggedIndex === -1 || targetIndex === -1) return

  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()

  let insertBefore: boolean
  if (orientation === 'vertical') {
    // Vertical: check horizontal position (left/right)
    const midX = rect.left + rect.width / 2
    insertBefore = e.clientX < midX
  } else {
    // Horizontal: check vertical position (top/bottom)
    const midY = rect.top + rect.height / 2
    insertBefore = e.clientY < midY
  }

  this.state.columnDragPreview = {
    targetColIndex: insertBefore ? targetIndex : targetIndex,
    insertBefore
  }
}
```

#### 6. Test Horizontal Mode Thoroughly

**Testing Checklist - Horizontal Mode**:
- [ ] Toggle to horizontal - layout changes correctly
- [ ] Frozen column on left with header cards
- [ ] Scrollable rows flow right (time)
- [ ] Vertical scroll for lanes (rows)
- [ ] Horizontal scroll for time (columns)
- [ ] Drag cards within row (right along timeline)
- [ ] Drop cards on empty cells
- [ ] Drag rows up/down (lane reordering)
- [ ] Undo/redo works correctly
- [ ] Delete card works
- [ ] Edit card in modal works
- [ ] Upload media works
- [ ] Column download works
- [ ] Switch back to vertical - data intact

**Testing Checklist - Vertical Mode (Regression)**:
- [ ] All existing functionality still works
- [ ] No visual regressions
- [ ] Frozen row scroll propagation works
- [ ] Column reordering works
- [ ] All operations work as before

#### 7. Add Keyboard Shortcut (Optional Enhancement)
**File**: `frontend/src/routes/+page.svelte`

```typescript
onMount(() => {
  // ... existing code ...

  // Keyboard shortcut: Cmd/Ctrl + T to toggle orientation
  const handleKeyboard = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 't') {
      e.preventDefault()
      try {
        const newOrientation = state.orientation.name === 'vertical' ? 'horizontal' : 'vertical'
        state.setOrientation(newOrientation)
        showToast(`Switched to ${newOrientation} mode`)
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Failed to change orientation')
      }
    }
  }

  window.addEventListener('keydown', handleKeyboard)
  return () => window.removeEventListener('keydown', handleKeyboard)
})
```

### Success Criteria
- [ ] HorizontalOrientation strategy fully implemented
- [ ] Toggle switches between vertical and horizontal
- [ ] Vertical mode: time flows down, lanes are columns (works as before)
- [ ] Horizontal mode: time flows right, lanes are rows
- [ ] Drag/drop works correctly in both orientations
- [ ] Lane reordering works in both orientations
- [ ] Undo/redo works in both orientations
- [ ] Preference persists across page reloads via localStorage
- [ ] All operations (delete, edit, upload, download) work in both modes
- [ ] No regressions in vertical mode

### Commit Message
```
feat: Implement horizontal orientation with row-major layout

- Implement HorizontalOrientation strategy (time=cols, lanes=rows)
- Add conditional rendering in SheetGrid for horizontal layout
- Add frozen column (left sticky) + scrollable rows for horizontal mode
- Add CSS for horizontal grid layout with proper scroll behavior
- Update drag preview positioning for horizontal orientation
- Update lane drag indicators for vertical reordering
- Keyboard shortcut: Cmd/Ctrl+T to toggle orientation

Users can now toggle between:
- Vertical: time flows down, lanes are columns (column-major)
- Horizontal: time flows right, lanes are rows (row-major)

Closes #[issue-number]
```

---

## Session Instructions

### To execute Phase 3:
```
Please execute Phase 3 of the work order in TRANSPOSE_WORK_ORDER.md
```

---

## Notes
- Phase 3 builds on the Strategy Pattern from Phase 2
- HorizontalOrientation is a mirror of VerticalOrientation with swapped axes
- Conditional rendering in SheetGrid prevents DOM reuse issues
- All operations already use strategy methods, so they work in both orientations
- Test thoroughly in both orientations before merging
- Update this work order if requirements change
