# Nanosheet Architecture Design

## Overview
This document outlines the complete architectural refactoring to support multiple orientations, data sources, and extensible card operations while maintaining clean separation of concerns.

## Current Issues
1. **3,009 lines** in +page.svelte (still too large)
2. **63 functions** mixed together (UI, business logic, API, operations)
3. **Scattered orientation logic** (if/else checks everywhere)
4. **No separation** between app shell and sheet content
5. **Card operations** mixed with general logic
6. **No extensibility** for new data sources or operations

## Target Architecture

### 1. App Structure (Layers)

```
┌─────────────────────────────────────────────────────────┐
│  +page.svelte (~150 lines)                              │
│  - App orchestration only                               │
│  - Lifecycle management (onMount/onDestroy)             │
│  - Strategy initialization                              │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  AppShell    │  │  SheetState  │  │  Strategies  │
│  Components  │  │  (Reactive)  │  │  (Business)  │
└──────────────┘  └──────────────┘  └──────────────┘
```

### 2. File Structure

```
frontend/src/
├── routes/
│   └── +page.svelte                    # ~150 lines - App orchestrator
│
├── lib/
│   ├── app/                            # APP SHELL LAYER
│   │   ├── AppLayout.svelte            # Main app container
│   │   ├── Toolbar.svelte              # Top toolbar
│   │   ├── LevelsBar.svelte            # Left sidebar (Film/Blocks/Scenes/Shots/Images)
│   │   ├── Breadcrumb.svelte           # Navigation breadcrumb
│   │   └── StatusBar.svelte            # Bottom status (optional)
│   │
│   ├── sheet/                          # SHEET CORE LAYER
│   │   ├── types.ts                    # ✅ TypeScript interfaces
│   │   ├── SheetLayout.ts              # ✅ Layout helpers
│   │   ├── SheetState.svelte.ts        # State management (uses strategies)
│   │   │
│   │   ├── strategies/                 # STRATEGY PATTERN
│   │   │   ├── orientation/
│   │   │   │   ├── OrientationStrategy.ts      # Interface
│   │   │   │   ├── VerticalOrientation.ts      # Time flows down
│   │   │   │   ├── HorizontalOrientation.ts    # Time flows right
│   │   │   │   └── index.ts                    # Exports
│   │   │   │
│   │   │   └── dataSource/
│   │   │       ├── DataSourceStrategy.ts       # Interface
│   │   │       ├── YjsDataSource.ts            # Collaborative Yjs
│   │   │       ├── FileSystemDataSource.ts     # File tree exploration
│   │   │       ├── LocalStorageDataSource.ts   # Local-only data
│   │   │       └── index.ts                    # Exports
│   │   │
│   │   └── operations/                 # OPERATIONS LAYER
│   │       ├── CardOperations.ts       # Base card operations
│   │       ├── MediaOperations.ts      # Media-specific operations
│   │       ├── DragOperations.ts       # Drag/drop logic
│   │       ├── UndoRedoOperations.ts   # Undo/redo logic
│   │       ├── ColumnOperations.ts     # Column/lane operations
│   │       └── index.ts                # Exports
│   │
│   ├── components/                     # UI COMPONENTS LAYER
│   │   ├── ToastNotification.svelte    # ✅
│   │   ├── ConfirmDialog.svelte        # ✅
│   │   ├── CardModal.svelte            # ✅
│   │   ├── SheetCard.svelte            # ✅
│   │   ├── SheetColumn.svelte          # ✅
│   │   └── SheetGrid.svelte            # ✅
│   │
│   ├── api/                            # API LAYER
│   │   ├── client.ts                   # Base API client (fetch wrapper)
│   │   ├── sheetApi.ts                 # Sheet endpoints
│   │   ├── cardApi.ts                  # Card endpoints
│   │   └── mediaApi.ts                 # Media upload/generation
│   │
│   └── yjs/                            # YJS INTEGRATION LAYER
│       ├── connection.ts               # Yjs connection setup
│       ├── sync.ts                     # Sync handlers
│       └── observers.ts                # Yjs observers
```

## 3. Strategy Pattern Details

### 3.1 Orientation Strategy

**Purpose:** Abstract vertical vs horizontal layout logic

```typescript
// strategies/orientation/OrientationStrategy.ts
export interface OrientationStrategy {
  readonly name: 'vertical' | 'horizontal'

  // Coordinate mapping
  getTimeline(rows: string[], cols: string[]): string[]
  getLanes(rows: string[], cols: string[]): string[]
  cellKey(timeId: string, laneId: string): string
  parseCellKey(key: string): { timeId: string; laneId: string }

  // Drag logic
  calculateInsertBefore(
    rect: DOMRect,
    mousePos: { x: number; y: number }
  ): boolean

  // Shift operations (for drag/drop)
  shiftCellsForward(
    cells: Map<string, any>,
    timeline: string[],
    laneId: string,
    startIndex: number
  ): void

  shiftCellsBackward(
    cells: Map<string, any>,
    timeline: string[],
    laneId: string,
    startIndex: number
  ): void
}
```

**Benefits:**
- Toggle orientation = swap strategy instance
- No scattered if/else checks
- Easy to add diagonal, radial, or other layouts

### 3.2 Data Source Strategy

**Purpose:** Abstract where data comes from (Yjs, file system, API, etc.)

```typescript
// strategies/dataSource/DataSourceStrategy.ts
export interface DataSourceStrategy {
  readonly type: 'yjs' | 'filesystem' | 'local' | 'api'

  // Connection
  connect(identifier: string, options?: any): Promise<void>
  disconnect(): void

  // Data access
  getTimeline(): string[]
  getLanes(): string[]
  getCells(): Map<string, CellData>
  getCardsMetadata(): Map<string, Card>

  // Mutations
  setCell(key: string, data: CellData): void
  deleteCell(key: string): void
  addLane(laneId: string, index?: number): void
  deleteLane(laneId: string): void
  reorderLane(fromIndex: number, toIndex: number): void

  // Reactivity
  subscribe(callback: () => void): () => void

  // Batch operations
  batchUpdate(fn: () => void): void
}
```

**Use Cases:**

**Current: Yjs (Collaborative)**
```typescript
class YjsDataSource implements DataSourceStrategy {
  type = 'yjs' as const
  private sheet: SheetConnection

  async connect(sheetId: string) {
    this.sheet = await connectSheet(WS_URL, sheetId)
  }

  getTimeline() { return this.sheet.rowOrder.toArray() }
  getLanes() { return this.sheet.colOrder.toArray() }
  // ... real-time collaborative updates
}
```

**Future: File System**
```typescript
class FileSystemDataSource implements DataSourceStrategy {
  type = 'filesystem' as const
  private fileTree: FileNode[]

  async connect(rootPath: string) {
    this.fileTree = await fetchFileTree(rootPath)
  }

  getTimeline() {
    // Option A: Directory depth
    // Option B: Modification time buckets
    // Option C: Alphabetical
    return this.extractTimelineDimension()
  }

  getLanes() {
    // Option A: File types (tsx, ts, css, etc.)
    // Option B: Top-level directories
    // Option C: Git status (modified, staged, etc.)
    return this.extractLanesDimension()
  }

  getCells() {
    // Each file becomes a card
    // File path maps to time/lane coordinates
  }
}
```

## 4. Operations Layer

**Purpose:** Separate card operations by concern, extensible for new media types

### 4.1 Card Operations (Base)

```typescript
// operations/CardOperations.ts
export class CardOperations {
  constructor(
    private state: SheetState,
    private api: CardApi
  ) {}

  async createCard(laneId: string, timeId: string, data: Partial<Card>): Promise<string>
  async deleteCard(cardId: string): Promise<void>
  async updateCard(cardId: string, updates: Partial<Card>): Promise<void>
  async duplicateCard(cardId: string): Promise<string>

  // Get cards in various ways
  getCard(cardId: string): Card | undefined
  getCardsInLane(laneId: string): Card[]
  getCardsInTime(timeId: string): Card[]
}
```

### 4.2 Media Operations (Specialized)

```typescript
// operations/MediaOperations.ts
export class MediaOperations {
  constructor(
    private state: SheetState,
    private api: MediaApi
  ) {}

  // Upload operations
  async uploadImage(cardId: string, file: File): Promise<string>
  async uploadVideo(cardId: string, file: File): Promise<string>

  // Generation operations
  async generateImage(cardId: string, prompt: string): Promise<string>
  async generateVideo(cardId: string, prompt: string): Promise<string>

  // Transformation operations
  async applyFilter(cardId: string, filter: FilterType): Promise<void>
  async resizeMedia(cardId: string, dimensions: { width: number; height: number }): Promise<void>
  async extractFrame(videoCardId: string, timestamp: number): Promise<string>

  // Drawing/annotation operations
  async saveDrawing(cardId: string, strokes: DrawingStroke[]): Promise<void>
  async clearDrawing(cardId: string): Promise<void>

  // Attachment operations
  async addAttachment(cardId: string, file: File): Promise<void>
  async deleteAttachment(cardId: string, attachmentId: string): Promise<void>
}
```

### 4.3 Drag Operations

```typescript
// operations/DragOperations.ts
export class DragOperations {
  constructor(
    private state: SheetState,
    private orientation: OrientationStrategy,
    private dataSource: DataSourceStrategy
  ) {}

  handleDragStart(timeId: string, laneId: string, cardId: string): void
  handleDragOver(targetTime: string, targetLane: string, rect: DOMRect, mousePos: Point): void
  handleDrop(targetTime: string, targetLane: string): void
  handleDragEnd(): void

  // Column dragging
  handleColumnDragStart(laneId: string): void
  handleColumnDragOver(targetLaneId: string): void
  handleColumnDrop(targetLaneId: string): void
}
```

### 4.4 Undo/Redo Operations

```typescript
// operations/UndoRedoOperations.ts
export class UndoRedoOperations {
  constructor(
    private state: SheetState,
    private dataSource: DataSourceStrategy
  ) {}

  private undoStack: UndoOperation[] = []
  private redoStack: UndoOperation[] = []

  async undo(): Promise<void>
  async redo(): Promise<void>

  // Record operations
  recordMove(from: CellPosition, to: CellPosition, cardId: string): void
  recordDelete(position: CellPosition, cardId: string, cardData: Card): void
  recordInsert(position: CellPosition, cardId: string): void
  recordEdit(cardId: string, before: Card, after: Card): void
}
```

### 4.5 Column Operations

```typescript
// operations/ColumnOperations.ts
export class ColumnOperations {
  constructor(
    private state: SheetState,
    private dataSource: DataSourceStrategy
  ) {}

  async addColumn(index?: number): Promise<string>
  async deleteColumn(laneId: string): Promise<void>
  async duplicateColumn(sourceLaneId: string): Promise<string>
  async reorderColumn(fromIndex: number, toIndex: number): Promise<void>
  async downloadColumn(laneId: string): Promise<void>
}
```

## 5. App Shell Components

### 5.1 AppLayout.svelte

**Purpose:** Top-level layout structure

```svelte
<script lang="ts">
  import Toolbar from './Toolbar.svelte'
  import LevelsBar from './LevelsBar.svelte'
  import Breadcrumb from './Breadcrumb.svelte'

  interface Props {
    children: Snippet
  }

  let { children }: Props = $props()
</script>

<div class="app-layout">
  <Toolbar />

  <div class="app-body">
    <LevelsBar />

    <div class="app-main">
      <Breadcrumb />
      <div class="app-content">
        {@render children()}
      </div>
    </div>
  </div>
</div>
```

### 5.2 Toolbar.svelte

**Purpose:** Top toolbar with controls

**Features:**
- App title
- Thumbnail size selector
- Undo/redo buttons
- Sound toggle
- Orientation toggle (Phase 3)
- Settings menu
- Profile badge

### 5.3 LevelsBar.svelte

**Purpose:** Left sidebar with hierarchical navigation

**Features:**
- Project name
- Level navigation:
  - Film (top level)
  - Blocks (sequences)
  - Scenes (within blocks)
  - Shots (within scenes)
  - Images (within shots)
- Active level highlighting
- Counts per level

### 5.4 Breadcrumb.svelte

**Purpose:** Show current navigation path

**Features:**
- Film > Block 1 > Scene 3 > Shots
- Clickable navigation
- Collapse on narrow screens

## 6. SheetState (Reactive State Management)

```typescript
// sheet/SheetState.svelte.ts
import type { OrientationStrategy } from './strategies/orientation'
import type { DataSourceStrategy } from './strategies/dataSource'

export class SheetState {
  // Strategies (swappable at runtime)
  orientation = $state<OrientationStrategy>(new VerticalOrientation())
  dataSource = $state<DataSourceStrategy>(new YjsDataSource())

  // UI State
  loading = $state(true)
  selectedThumbnailSize = $state(3)
  stickyTopRow = $state(true)
  isSoundMuted = $state(false)

  // Drag State
  draggedCard = $state<DraggedCard | null>(null)
  dragPreview = $state<DragPreview | null>(null)
  isDragging = $state(false)
  draggedColumn = $state<string | null>(null)
  columnDragPreview = $state<ColumnDragPreview | null>(null)
  isColumnDragging = $state(false)

  // Modal State
  showModal = $state(false)
  modalCardId = $state<string | null>(null)
  modalMediaId = $state<string | null>(null)

  // Menu State
  openColumnMenu = $state<string | null>(null)
  showThumbnailMenu = $state(false)
  openEllipsisMenu = $state<string | null>(null)

  // Dialog State
  showConfirmDialog = $state(false)
  confirmMessage = $state('')
  confirmCallback: (() => void) | null = null

  // Toast State
  showToast = $state(false)
  toastMessage = $state('')

  // Derived State (uses strategies)
  timeline = $derived(
    this.orientation.getTimeline(
      this.dataSource.getTimeline(),
      this.dataSource.getLanes()
    )
  )

  lanes = $derived(
    this.orientation.getLanes(
      this.dataSource.getTimeline(),
      this.dataSource.getLanes()
    )
  )

  displayCols = $derived([
    ...this.lanes,
    `phantom-col-${this.lanes.length}`
  ])

  displayRows = $derived([
    ...this.timeline,
    `phantom-row-${this.timeline.length}`
  ])

  // Delegate to strategies
  cellKey(timeId: string, laneId: string): string {
    return this.orientation.cellKey(timeId, laneId)
  }

  parseCellKey(key: string) {
    return this.orientation.parseCellKey(key)
  }

  // Switch strategies
  setOrientation(type: 'vertical' | 'horizontal') {
    this.orientation = type === 'vertical'
      ? new VerticalOrientation()
      : new HorizontalOrientation()
    localStorage.setItem('orientation', type)
  }

  async setDataSource(source: DataSourceStrategy) {
    await this.dataSource.disconnect()
    this.dataSource = source
    await source.connect(/* identifier */)
  }
}
```

## 7. Final +page.svelte (Orchestrator)

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import AppLayout from '$lib/app/AppLayout.svelte'
  import SheetGrid from '$lib/components/SheetGrid.svelte'
  import { SheetState } from '$lib/sheet/SheetState.svelte'
  import { CardOperations } from '$lib/sheet/operations/CardOperations'
  import { MediaOperations } from '$lib/sheet/operations/MediaOperations'
  import { DragOperations } from '$lib/sheet/operations/DragOperations'
  import { UndoRedoOperations } from '$lib/sheet/operations/UndoRedoOperations'
  import { ColumnOperations } from '$lib/sheet/operations/ColumnOperations'

  // Initialize state
  const state = new SheetState()

  // Initialize operations
  const cardOps = new CardOperations(state, cardApi)
  const mediaOps = new MediaOperations(state, mediaApi)
  const dragOps = new DragOperations(state, state.orientation, state.dataSource)
  const undoRedoOps = new UndoRedoOperations(state, state.dataSource)
  const columnOps = new ColumnOperations(state, state.dataSource)

  onMount(async () => {
    // Load settings
    state.selectedThumbnailSize = loadThumbnailSize()
    state.stickyTopRow = loadStickyTopRow()

    // Connect data source
    await state.dataSource.connect(SHEET_ID)

    // Subscribe to changes
    state.dataSource.subscribe(() => {
      // Updates happen automatically via reactivity
    })

    // Setup keyboard listeners
    window.addEventListener('keydown', handleKeydown)

    state.loading = false
  })

  onDestroy(() => {
    state.dataSource.disconnect()
    window.removeEventListener('keydown', handleKeydown)
  })

  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      e.preventDefault()
      e.shiftKey ? undoRedoOps.redo() : undoRedoOps.undo()
    }
  }
</script>

<AppLayout>
  {#if state.loading}
    <div class="loading">Loading...</div>
  {:else}
    <SheetGrid
      {state}
      {dragOps}
      {cardOps}
      {mediaOps}
      {columnOps}
    />
  {/if}

  <!-- Modals, toasts, dialogs -->
  <CardModal {state} {mediaOps} />
  <ConfirmDialog {state} />
  <ToastNotification {state} />
</AppLayout>
```

**Result:** ~150 lines in +page.svelte

## 8. Benefits

### Separation of Concerns ✅
- **App shell** (Toolbar, LevelsBar, Breadcrumb) separate from sheet
- **Business logic** in operations classes
- **State management** in SheetState
- **Strategies** for orientation and data source
- **UI components** pure and reusable

### Extensibility ✅
- Add new orientations: implement OrientationStrategy
- Add new data sources: implement DataSourceStrategy
- Add new card operations: extend MediaOperations
- Add new levels: update LevelsBar

### Testability ✅
- Test strategies in isolation
- Test operations with mock state
- Test components with mock props
- No 3,000-line file to navigate

### Maintainability ✅
- Clear file organization
- Single responsibility per file
- Easy to find specific functionality
- New developers onboard faster

## 9. Migration Path

### Phase 2.5: Architecture Refactoring (Current)
1. Create strategy interfaces and implementations
2. Extract operations classes
3. Create SheetState.svelte.ts
4. Extract app shell components
5. Refactor +page.svelte to orchestrate

### Phase 3: Horizontal Orientation (Easy now!)
1. Implement HorizontalOrientation strategy
2. Add orientation toggle in Toolbar
3. Test - that's it!

### Phase 4: File System Support
1. Implement FileSystemDataSource strategy
2. Add data source selector in Toolbar
3. Test - that's it!

## 10. Next Steps

1. **Create strategy pattern infrastructure** (orientation + data source)
2. **Extract operations classes** (card, media, drag, undo/redo, column)
3. **Create SheetState.svelte.ts** (reactive state with strategies)
4. **Build app shell components** (Toolbar, LevelsBar, Breadcrumb)
5. **Refactor +page.svelte** to orchestrate
6. **Test thoroughly**
7. **Commit Phase 2.5**

Ready to proceed?
