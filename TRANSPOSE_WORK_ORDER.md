# Work Order: Nanosheet Transpose Feature

## Overview
Generalize nanosheet to support both **column-major (vertical)** and **row-major (horizontal)** orientations using a time/lanes abstraction.

## Status
- ✅ **Phase 1 Complete**: Time/lanes abstraction implemented and deployed
- ✅ **Phase 2 Complete**: Modularization with Strategy Pattern architecture (including BOTH strategies!)
- ⏳ **Phase 3 Ready**: Wire up horizontal orientation UI (strategies already implemented)

## Current Architecture (After Phase 2)
- **Model**: `ySheet.ts` with `rowOrder`, `colOrder`, `cells` (sparse matrix) - **unchanged**
- **View**: Modular component architecture with SheetGrid, SheetColumn, SheetCard
- **State**: Centralized in `SheetState.svelte.ts` with proper `$state()` runes
- **Operations**: Extracted into CardOperations, DragOperations, UndoRedoOperations, ColumnOperations classes
- **Strategies**: OrientationStrategy interface with BOTH VerticalOrientation AND HorizontalOrientation fully implemented ✅
- **Orientation**: Vertical only (HorizontalOrientation exists and is complete but not wired to UI)
- **Deployment**: https://nanosheet.fly.dev

## Target Architecture
- **Model**: Unchanged (symmetric, orientation-agnostic) ✅
- **View**: Modular components with time/lanes abstraction ✅
- **Strategies**: Fully implemented for both orientations ✅
- **Orientation**: Toggle between vertical/horizontal ⏳ (UI wiring needed)
- **User Control**: Toggle button in toolbar + localStorage persistence ✅ (just needs strategy hookup)

## Key Learnings from Phase 1 & 2

### Phase 1 Learnings ✅
1. **Time/lanes abstraction is sound**: Strategy pattern works perfectly
2. **FLIP animations**: Svelte's `animate:flip` provides smooth reordering (300ms)
3. **Drag cursor positioning**: Centering cursor vertically on column preview fixes drop detection
4. **Yjs persistence**: Nested Y.Maps with observeDeep() for granular field updates

### Phase 2 Learnings ✅
1. **Strategy Pattern**: OrientationStrategy cleanly separates vertical/horizontal logic
2. **Both Strategies Implemented**: VerticalOrientation AND HorizontalOrientation are complete with all methods
3. **Operations Classes**: CardOperations, DragOperations, ColumnOperations, UndoRedoOperations work well
4. **SheetState**: Centralized reactive state with `$state()` and `$derived()` runes
5. **Component Hierarchy**: SheetGrid → SheetColumn → SheetCard works cleanly
6. **App Shell**: Toolbar, AppLayout, LevelsBar, Breadcrumb extracted successfully
7. **Frozen Row Scroll**: Wheel event propagation needed for vertical scroll on frozen row

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
│   │       ├── OrientationStrategy.ts      ✅ Full interface with 11 methods
│   │       ├── VerticalOrientation.ts      ✅ FULLY IMPLEMENTED (122 lines)
│   │       └── HorizontalOrientation.ts    ✅ FULLY IMPLEMENTED (125 lines)
│   └── types.ts                ✅ TypeScript interfaces
├── components/
│   ├── SheetGrid.svelte        ✅ Main grid with frozen row (vertical only)
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
- **Orientation Toggle UI**: Already exists in Toolbar.svelte with custom SVG icons
- **Error Handling**: Orientation change wrapped in try-catch with toast
- **Both Strategies Complete**: VerticalOrientation AND HorizontalOrientation fully implemented with all 11 interface methods

### OrientationStrategy Interface (11 Methods)
Both strategies implement:
1. `getTimeline(rows, cols)` - Returns time axis
2. `getLanes(rows, cols)` - Returns lanes axis
3. `cellKey(timeId, laneId)` - Constructs cell keys
4. `parseCellKey(key)` - Parses cell keys
5. `calculateInsertBefore(rect, mousePos)` - Drag drop positioning
6. `getDragAxis()` - Returns 'x' or 'y'
7. `shiftCellsForwardInTime(...)` - Shift operations for drag/drop
8. `shiftCellsBackwardInTime(...)` - Shift operations for undo/redo
9. `getContainerFlexDirection()` - Layout direction
10. `getLaneFlexDirection()` - Lane direction
11. `getFrozenLaneStyle()` - Frozen header positioning

---

## Phase 3: Wire Up Horizontal Orientation UI
**Branch**: `feat/horizontal-orientation` (create from `feat/time-lanes-abstraction`)
**Goal**: Connect the existing HorizontalOrientation strategy to the UI layer
**Prerequisites**: Phase 1 & 2 complete ✅

### IMPORTANT: What's Already Done ✅

The work is **90% complete**! Here's what exists:

1. ✅ **HorizontalOrientation Strategy**: Fully implemented with all 11 methods
2. ✅ **VerticalOrientation Strategy**: Fully implemented with all 11 methods
3. ✅ **OrientationStrategy Interface**: Complete with all required methods
4. ✅ **Orientation Toggle UI**: Toolbar has vertical/horizontal buttons
5. ✅ **State Management**: `SheetState.orientation` is reactive
6. ✅ **localStorage**: `savePreference()` and `loadPreference()` methods exist
7. ✅ **Error Handling**: Toast shows "Horizontal orientation not yet implemented"

### What Needs to Be Done ⏳ (Only 10% remaining!)

1. **Update SheetGrid.svelte** to use strategy methods for rendering
2. **Update DragOperations** to use `strategy.calculateInsertBefore()` and `strategy.getDragAxis()`
3. **Test horizontal mode** thoroughly
4. **Remove error toast** from orientation toggle

That's it! The strategies are done. We just need to wire them up.

---

## Phase 3 Tasks

### Task 1: Update SheetGrid to Use Strategy Methods
**File**: `frontend/src/lib/components/SheetGrid.svelte`

**Current State**: SheetGrid is hardcoded for vertical layout only

**What to Change**:
```svelte
<script lang="ts">
  // Add orientation prop
  export let orientation: 'vertical' | 'horizontal'
  export let strategy: OrientationStrategy  // Pass the strategy instance

  // ... existing props ...
</script>

<!-- Use strategy methods for layout -->
<div
  class="sheet-view"
  style="flex-direction: {strategy.getContainerFlexDirection()}"
>
  {#if stickyTopRow}
    <div
      class="frozen-lane"
      style="
        flex-direction: {strategy.getLaneFlexDirection()};
        {Object.entries(strategy.getFrozenLaneStyle())
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ')}
      "
    >
      <!-- Frozen header cards -->
    </div>
  {/if}

  <div
    class="lanes-container"
    style="flex-direction: {strategy.getContainerFlexDirection()}"
  >
    <!-- Render lanes using strategy -->
    {#each displayLanes as laneId (laneId)}
      <div
        class="lane"
        style="flex-direction: {strategy.getLaneFlexDirection()}"
      >
        <!-- Render cards in this lane -->
      </div>
    {/each}
  </div>
</div>
```

**Key Changes**:
- Pass `strategy` prop from +page.svelte
- Use `strategy.getContainerFlexDirection()` for main container
- Use `strategy.getLaneFlexDirection()` for individual lanes
- Use `strategy.getFrozenLaneStyle()` for frozen header positioning
- No conditional rendering needed - strategy methods handle everything!

### Task 2: Update DragOperations to Use Strategy
**File**: `frontend/src/lib/sheet/operations/DragOperations.ts`

**Current Issue**: Drag positioning is hardcoded for vertical (Y-axis)

**What to Change**:

```typescript
handleDragStart(e: DragEvent, time: string, lane: string, cardId: string): void {
  // ... existing setup code ...

  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    const target = e.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()

    // Use strategy to get drag axis
    const dragAxis = this.strategy.getDragAxis()

    if (dragAxis === 'y') {
      // Vertical: center vertically
      const offsetY = rect.height / 2
      e.dataTransfer.setDragImage(target, e.clientX - rect.left, offsetY)
    } else {
      // Horizontal: center horizontally
      const offsetX = rect.width / 2
      e.dataTransfer.setDragImage(target, offsetX, e.clientY - rect.top)
    }
  }

  // ... rest of existing code ...
}

handleDragOver(e: DragEvent, time: string, lane: string, element: HTMLElement): void {
  e.preventDefault()
  if (!this.state.isDragging) return

  const rect = element.getBoundingClientRect()
  const mousePos = { x: e.clientX, y: e.clientY }

  // Use strategy to calculate insert position
  const insertBefore = this.strategy.calculateInsertBefore(rect, mousePos)

  this.state.dragPreview = {
    targetTime: time,
    targetLane: lane,
    insertBefore
  }
}
```

**Key Changes**:
- Use `this.strategy.getDragAxis()` instead of hardcoded 'y'
- Use `this.strategy.calculateInsertBefore(rect, mousePos)` instead of hardcoded Y comparison
- Everything else works automatically!

### Task 3: Pass Strategy to Components
**File**: `frontend/src/routes/+page.svelte`

**What to Add**:
```typescript
// Pass strategy instance to SheetGrid
<SheetGrid
  orientation={state.orientation.name}
  strategy={state.orientation}  // Pass the actual strategy instance
  // ... rest of existing props ...
/>
```

That's it! The strategy instance already has all the methods.

### Task 4: Remove Error Toast from Orientation Toggle
**File**: `frontend/src/routes/+page.svelte`

**Current Code** (~line 665):
```typescript
onSetOrientation={(newOrientation) => {
  try {
    state.setOrientation(newOrientation)
    state.savePreference('orientation', newOrientation)
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Failed to change orientation')
  }
}}
```

**What to Change**:
```typescript
onSetOrientation={(newOrientation) => {
  state.setOrientation(newOrientation)
  state.savePreference('orientation', newOrientation)
  showToast(`Switched to ${newOrientation} mode`)
}}
```

Remove the try-catch since HorizontalOrientation no longer throws errors!

### Task 5: Update SheetState to Use Strategy Methods
**File**: `frontend/src/lib/sheet/SheetState.svelte.ts`

**Check if operations are using strategy**:
- Ensure `getTimeline()` calls `this.orientation.getTimeline(this.rows, this.cols)`
- Ensure `getLanes()` calls `this.orientation.getLanes(this.rows, this.cols)`

This might already be done in Phase 2.

---

## Testing Checklist

### Horizontal Mode Testing
- [ ] Toggle to horizontal - layout rotates correctly
- [ ] Frozen column on left with header cards stacked vertically
- [ ] Scrollable rows flow right (time flows horizontally)
- [ ] Vertical scroll for lanes (rows)
- [ ] Horizontal scroll for time (columns)
- [ ] Drag cards within row (right along timeline)
- [ ] Drop cards on empty cells
- [ ] Insert position indicator shows left/right (not top/bottom)
- [ ] Drag rows up/down (lane reordering)
- [ ] Undo/redo works correctly
- [ ] Delete card works
- [ ] Edit card in modal works
- [ ] Upload media works
- [ ] Column download works
- [ ] Switch back to vertical - data intact

### Vertical Mode (Regression Testing)
- [ ] All existing functionality still works
- [ ] No visual regressions
- [ ] Frozen row scroll propagation works
- [ ] Column reordering works
- [ ] All operations work as before

### Persistence Testing
- [ ] Orientation preference saves to localStorage
- [ ] Page reload restores saved orientation
- [ ] Switching orientations updates localStorage
- [ ] Data persists correctly across orientation changes

---

## Success Criteria

- [ ] Toggle switches smoothly between vertical and horizontal
- [ ] Vertical mode: time flows down, lanes are columns (works as before)
- [ ] Horizontal mode: time flows right, lanes are rows
- [ ] Drag/drop works correctly in both orientations using strategy methods
- [ ] Lane reordering works in both orientations
- [ ] Undo/redo works in both orientations
- [ ] Preference persists across page reloads via localStorage
- [ ] All operations (delete, edit, upload, download) work in both modes
- [ ] No regressions in vertical mode
- [ ] No errors in console
- [ ] Smooth FLIP animations in both modes

---

## Estimated Effort

**Original Estimate**: 2-3 days (if strategies weren't implemented)
**Actual Estimate**: 2-4 hours (since strategies are done!)

**Breakdown**:
- Task 1 (SheetGrid): 1 hour
- Task 2 (DragOperations): 30 minutes
- Task 3 (Pass strategy): 15 minutes
- Task 4 (Remove error): 5 minutes
- Task 5 (Verify state): 15 minutes
- Testing: 1 hour

**Total**: ~3 hours of actual work

---

## Commit Message (When Done)

```
feat: Enable horizontal orientation with strategy-driven UI

Wire up the existing HorizontalOrientation strategy to the UI layer:
- Update SheetGrid to use strategy methods for layout direction
- Update DragOperations to use strategy.calculateInsertBefore()
- Update DragOperations to use strategy.getDragAxis() for cursor positioning
- Pass strategy instance to SheetGrid component
- Remove error toast since HorizontalOrientation is fully implemented

The HorizontalOrientation strategy was already complete from Phase 2.
This commit simply connects it to the rendering layer.

Users can now toggle between:
- Vertical: time flows down, lanes are columns (column-major)
- Horizontal: time flows right, lanes are rows (row-major)

Both orientations use the same Strategy Pattern methods for all operations.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## Session Instructions

### To execute Phase 3:
```
Please execute Phase 3 of the work order in TRANSPOSE_WORK_ORDER.md
```

---

## Notes
- Phase 3 is mostly just wiring up existing strategies to the UI
- Both VerticalOrientation and HorizontalOrientation are complete
- The Strategy Pattern makes this trivial - just pass the strategy instance and use its methods
- No complex logic needed - the strategies handle everything
- Test thoroughly in both orientations before merging
