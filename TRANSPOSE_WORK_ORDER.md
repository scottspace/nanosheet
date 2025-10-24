# Work Order: Nanosheet Transpose Feature

## Overview
Generalize nanosheet to support both **column-major (vertical)** and **row-major (horizontal)** orientations as pure view transformations of the same canonical data.

## Status
- ✅ **Phase 1 Complete**: Time/lanes abstraction implemented and deployed
- ✅ **Phase 2 Complete**: Modularization with Strategy Pattern architecture
- ⏳ **Phase 3 In Progress**: Add horizontal orientation rendering (view transform only)

## Current Architecture (After Phase 2)
- **Model**: `ySheet.ts` with `rowOrder`, `colOrder`, `cells` - **unchanged, orientation-agnostic**
- **View**: Modular components (SheetGrid, SheetColumn, SheetCard)
- **State**: Centralized in `SheetState.svelte.ts` with `$state()` runes
- **Operations**: CardOperations, DragOperations, UndoRedoOperations, ColumnOperations classes
- **Strategies**: OrientationStrategy interface with VerticalOrientation implemented
- **Orientation**: Vertical only (HorizontalOrientation ready to implement)

---

## Phase 3: Horizontal Orientation - Pure View Transform

**Branch**: `feat/horizontal-orientation`
**Starting Commit**: `da168a7` (before horizontal UI implementation)
**Goal**: Add horizontal mode as CSS/rendering transformation of same canonical data
**Prerequisites**: Phase 1 & 2 complete ✅

### Core Principle ⭐

**The Yjs data structure NEVER changes based on orientation.**

Orientation is purely a client-side view transformation. Multiple users can view the same sheet in different orientations simultaneously.

### Canonical Data Format (Immutable)

```typescript
// This NEVER changes regardless of orientation
rows = ['r-0', 'r-1', 'r-2', ...]  // Time IDs
cols = ['c-0', 'c-1', 'c-2', ...]  // Lane IDs
cells = {
  'r-0:c-0': { cardId: 'card-A' },
  'r-0:c-1': { cardId: 'card-B' },
  'r-1:c-0': { cardId: 'card-C' },
  // Always ${rowId}:${colId} format
}
```

### Mental Model

**Lanes are containers (cols array):**
- Vertical mode: lanes appear as columns (going across)
- Horizontal mode: lanes appear as rows (going down)
- **Same data, different visual direction**

**Time flows within lanes (rows array):**
- Vertical mode: time flows down within each column
- Horizontal mode: time flows right within each row
- **Same progression, different visual direction**

**All operations happen in lanes:**
- Insert/delete: shift cards in time within the lane
- Lane reorder: change order of lanes (column/row reordering)
- **Same operations, different visual appearance**

### Coordinate System - Key Insight!

**Both orientations use IDENTICAL iteration:**

```svelte
<!-- SAME CODE FOR BOTH ORIENTATIONS! -->
{#each displayCols as laneId}  <!-- Lanes (c-0, c-1, c-2) -->
  {#each displayRows as timeId}  <!-- Times (r-0, r-1, r-2) -->
    {@const key = `${timeId}:${laneId}`}  <!-- Always same format! -->
    <!-- Render card -->
  {/each}
{/each}
```

**The ONLY difference:**
- **Vertical:** Outer loop creates `<Column style="flex-direction: column">`
- **Horizontal:** Outer loop creates `<Row style="flex-direction: row">`

**No coordinate swapping needed!** The transpose is purely CSS.

---

## Implementation Tasks

### Task 1: Verify/Update OrientationStrategy

**File**: `frontend/src/lib/sheet/strategies/orientation/OrientationStrategy.ts`

Ensure both strategies use IDENTICAL cellKey:

```typescript
interface OrientationStrategy {
  cellKey(timeId: string, laneId: string): string
  // Both return: `${timeId}:${laneId}`
  // No swapping! Same format for both orientations.
}
```

**Files to check:**
- `VerticalOrientation.ts` - should return `${timeId}:${laneId}`
- `HorizontalOrientation.ts` - should return `${timeId}:${laneId}` (SAME!)

### Task 2: Add Horizontal Mode Rendering to SheetGrid

**File**: `frontend/src/lib/components/SheetGrid.svelte`

**Current structure:**
```svelte
{#if orientation === 'vertical'}
  <div class="frozen-row">...</div>
  <div class="columns-container">
    {#each displayCols as laneId}
      <SheetColumn {laneId} times={displayRows} />
    {/each}
  </div>
{/if}
```

**Add horizontal mode (NEW):**
```svelte
{#if orientation === 'vertical'}
  <!-- Existing vertical mode (unchanged) -->
{:else}
  <!-- NEW: Horizontal mode -->
  <div class="horizontal-container">
    <!-- Frozen column (left side) -->
    {#if stickyTopRow}
      <div class="frozen-column">
        {#each displayCols as laneId (laneId)}
          {@const timeId = displayRows[0]}  <!-- First time -->
          {@const key = `${timeId}:${laneId}`}  <!-- Note: Same format! -->
          {@const cell = cellsMap.get(key)}
          {@const cardId = cell?.cardId}
          {@const card = cardId ? cardsMetadata.get(cardId) : null}

          <div class="lane-header-row">
            <!-- Lane title -->
            <div class="lane-title">
              <input
                type="text"
                value={shotTitles.get(laneId) || `Lane ${laneId}`}
                onchange={(e) => onShotTitleChange(laneId, e.currentTarget.value)}
              />
            </div>

            <!-- First card in lane -->
            {#if card}
              <!-- Render card (reuse existing card markup) -->
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <!-- Scrollable rows (right side) -->
    <div class="rows-container">
      {#each displayCols as laneId (laneId)}
        <div class="row">
          {#each displayRows.slice(1) as timeId (timeId)}
            {@const key = `${timeId}:${laneId}`}  <!-- Note: Same format! -->
            {@const cell = cellsMap.get(key)}
            {@const cardId = cell?.cardId}
            {@const card = cardId ? cardsMetadata.get(cardId) : null}

            {#if card}
              <!-- Render card -->
            {:else}
              <!-- Empty cell -->
            {/if}
          {/each}
        </div>
      {/each}
    </div>
  </div>
{/if}
```

**Key points:**
- Use `displayCols` and `displayRows` as-is (NO SWAPPING!)
- Outer loop: lanes (`displayCols`)
- Inner loop: times (`displayRows`)
- Cell key: always `${timeId}:${laneId}` (same as vertical!)

### Task 3: Add Horizontal Mode CSS

**File**: `frontend/src/lib/components/SheetGrid.svelte` (style section)

```css
/* Horizontal mode container */
.horizontal-container {
  display: flex;
  flex-direction: row;  /* frozen-column | rows-container */
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

/* Frozen column on left */
.frozen-column {
  display: flex;
  flex-direction: column;  /* lanes stack vertically */
  overflow-y: auto;
  flex-shrink: 0;
  border-right: 2px solid rgba(255, 255, 255, 0.15);
  padding-right: 1rem;
  margin-right: 1rem;
}

.lane-header-row {
  display: flex;
  flex-direction: row;  /* title + card go horizontally */
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
  margin-bottom: 0.5rem;
}

.lane-title {
  writing-mode: horizontal-tb;  /* Normal text, not rotated */
  flex-shrink: 0;
}

/* Rows container */
.rows-container {
  display: flex;
  flex-direction: column;  /* rows stack vertically */
  overflow-y: auto;
  overflow-x: auto;
  flex: 1;
  min-width: 0;
  padding-bottom: 2rem;
}

/* Individual row */
.row {
  display: flex;
  flex-direction: row;  /* cards flow horizontally */
  gap: 0.5rem;
  flex-shrink: 0;
  margin-bottom: 0.5rem;
  min-height: fit-content;
}
```

### Task 4: Update Orientation Toggle

**File**: `frontend/src/routes/+page.svelte`

Ensure the toggle properly switches orientation and shows toast:

```typescript
onSetOrientation={(newOrientation) => {
  state.setOrientation(newOrientation)
  state.savePreference('orientation', newOrientation)

  const subtitle = newOrientation === 'horizontal'
    ? 'Time flows left-to-right'
    : 'Time flows top-to-bottom'

  showToast(`Switched to ${newOrientation} mode`, subtitle)
}}
```

### Task 5: Verify Operations Work with Both Orientations

**All operations should work unchanged!**

The operations classes (CardOperations, DragOperations, etc.) already use semantic coordinates (timeId, laneId), so they work for both orientations automatically.

**Verify:**
- [ ] Card delete compacts lane correctly (up in vertical, left in horizontal)
- [ ] Card drag/drop works within lane
- [ ] Card drag/drop between lanes works
- [ ] Lane reordering works (column drag in vertical, row drag in horizontal)
- [ ] Undo/redo works correctly

---

## Visual Examples

### Canonical Data (Same for Both Views)

```
rows = ['r-0', 'r-1']
cols = ['c-0', 'c-1']
cells = {
  'r-0:c-0': card-A,
  'r-0:c-1': card-B,
  'r-1:c-0': card-C,
  'r-1:c-1': card-D
}
```

### Vertical Mode Display

```
         Lane A    Lane B
         (c-0)     (c-1)
       ┌─────────┬─────────┐
Shot 0 │ card-A  │ card-B  │
(r-0)  │ r-0:c-0 │ r-0:c-1 │
       ├─────────┼─────────┤
Shot 1 │ card-C  │ card-D  │
(r-1)  │ r-1:c-0 │ r-1:c-1 │
       └─────────┴─────────┘

Time flows ↓ (within columns)
Lanes go → (across columns)
```

### Horizontal Mode Display (Transposed View)

```
           Shot 0    Shot 1
           (r-0)     (r-1)
       ┌──────────┬──────────┐
Lane A │ card-A   │ card-C   │
(c-0)  │ r-0:c-0  │ r-1:c-0  │
       ├──────────┼──────────┤
Lane B │ card-B   │ card-D   │
(c-1)  │ r-0:c-1  │ r-1:c-1  │
       └──────────┴──────────┘

Time flows → (within rows)
Lanes go ↓ (down rows)
```

**Notice:** Same cell keys! Just different visual arrangement.

---

## Testing Checklist

### Data Consistency
- [ ] Vertical column c-0 shows: card-A, card-C (going down)
- [ ] Horizontal row c-0 shows: card-A, card-C (going right)
- [ ] Same cards, transposed layout ✓
- [ ] Cell keys remain unchanged when switching orientations

### Operations in Both Modes
- [ ] Delete card in vertical: column compacts upward
- [ ] Delete card in horizontal: row compacts leftward
- [ ] Drag card within lane works correctly
- [ ] Drag card to different lane works correctly
- [ ] Drag entire lane (column/row reordering) works
- [ ] Undo/redo works correctly in both modes

### Multi-User (Critical!)
- [ ] User A in vertical, User B in horizontal
- [ ] Both see same data (transposed view)
- [ ] Changes from A appear in B's view immediately
- [ ] Changes from B appear in A's view immediately
- [ ] No data corruption when users use different orientations

### Persistence
- [ ] Orientation preference saves to localStorage
- [ ] Page reload restores saved orientation
- [ ] Switching orientations updates localStorage

---

## What NOT to Do ❌

1. ❌ **Don't swap displayRows and displayCols arrays**
2. ❌ **Don't transpose cell data in Yjs when switching orientations**
3. ❌ **Don't create different cellKey logic for horizontal mode**
4. ❌ **Don't modify SheetState.setOrientation to transpose data**
5. ❌ **Don't modify operations code (already orientation-agnostic)**

## What TO Do ✅

1. ✅ **Use same arrays for both modes** (displayRows, displayCols)
2. ✅ **Use same cellKey format** (`${timeId}:${laneId}`)
3. ✅ **Change only HTML structure and CSS** (vertical columns vs horizontal rows)
4. ✅ **Iterate lanes × times** in both modes (just different containers)
5. ✅ **Let CSS handle the visual transformation** (flex-direction)

---

## Success Criteria

- [ ] Visual transpose works: First column in vertical = first row in horizontal
- [ ] Operations unchanged: All card/lane operations work identically in both modes
- [ ] Multi-user works: Different users can use different orientations on same sheet
- [ ] No data changes: Switching orientation never modifies Yjs data
- [ ] Performance: No lag when switching orientations
- [ ] All cells have same keys regardless of orientation
- [ ] No regressions in vertical mode

---

## Estimated Effort

**Total**: 3-4 hours

**Breakdown**:
- Task 1 (Verify strategies): 15 minutes
- Task 2 (SheetGrid horizontal HTML): 1.5 hours
- Task 3 (CSS): 30 minutes
- Task 4 (Toggle): 15 minutes
- Task 5 (Verify operations): 30 minutes
- Testing: 1 hour

---

## Commit Message (When Done)

```
feat: Add horizontal orientation as pure view transformation

Implement horizontal mode as a CSS/rendering transformation of the same
canonical Yjs data structure. Multiple users can now view the same sheet
in different orientations simultaneously.

Key changes:
- Add horizontal mode rendering to SheetGrid.svelte
- Use same coordinate system (displayRows/displayCols) for both modes
- Use same cellKey format for both modes
- Transpose achieved purely through CSS flex-direction
- No changes to Yjs data structure or operations code

Architecture:
- Vertical: lanes=columns, time flows down (column-major)
- Horizontal: lanes=rows, time flows right (row-major)
- Both use identical iteration: lanes × times
- All operations work unchanged in both modes

The canonical data (rows, cols, cells) never changes based on orientation.
Orientation is purely a client-side view preference.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## Notes

- Orientation is a VIEW-ONLY transformation
- Yjs data structure is orientation-agnostic
- Operations code doesn't need orientation conditionals
- The beauty: same code, same data, different CSS
- Test multi-user scenarios thoroughly!
