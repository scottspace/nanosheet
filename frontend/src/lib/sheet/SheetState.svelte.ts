/**
 * SheetState - Centralized reactive state management for nanosheet
 *
 * This module manages ALL application state using Svelte 5 runes ($state, $derived).
 * It integrates both strategy patterns (orientation + data source) and provides
 * a clean API for operation classes.
 *
 * Architecture:
 * - Uses OrientationStrategy for layout logic
 * - Uses DataSourceStrategy for persistence
 * - Yjs connection for real-time collaboration
 * - Reactive state with proper $state() declarations
 *
 * Benefits:
 * - Fixes Svelte 5 non-reactive warnings
 * - Centralized state management
 * - Easy testing (mock the entire state)
 * - Clean integration with operations classes
 */

import type { SheetConnection } from '../ySheet'
import { VerticalOrientation, type OrientationStrategy } from './strategies/orientation'
import { YjsServerDataSource, type DataSourceStrategy } from './strategies/dataSource'
import type { DraggedCard, DragPreview, ColumnDragPreview, UndoOperation } from './types'

// Thumbnail size presets (8 options in 16:9 ratio)
export const THUMBNAIL_SIZES = [
  { label: '160 × 90', width: 160, height: 90 },
  { label: '192 × 108', width: 192, height: 108 },
  { label: '224 × 126', width: 224, height: 126 },
  { label: '256 × 144', width: 256, height: 144 },
  { label: '288 × 162', width: 288, height: 162 },
  { label: '320 × 180', width: 320, height: 180 },
  { label: '384 × 216', width: 384, height: 216 },
  { label: '448 × 252', width: 448, height: 252 },
] as const

export class SheetState {
  // ============================================================================
  // STRATEGIES (swappable at runtime)
  // ============================================================================

  /** Orientation strategy (vertical/horizontal) */
  orientation = $state<OrientationStrategy>(new VerticalOrientation())

  /** Data source strategy (Yjs server/filesystem/database/etc.) */
  dataSource = $state<DataSourceStrategy>(new YjsServerDataSource())

  // ============================================================================
  // YJS CONNECTION & DATA
  // ============================================================================

  /** Yjs connection (collaborative layer) */
  sheet = $state<SheetConnection | null>(null)

  /** Row order from Yjs */
  rows = $state<string[]>([])

  /** Column order from Yjs */
  cols = $state<string[]>([])

  /** Cell map from Yjs (key format: "row:col") */
  cellsMap = $state<Map<string, { cardId: string }>>(new Map())

  /** Card metadata from Yjs */
  cardsMetadata = $state<Map<string, any>>(new Map())

  /** Shot/lane titles */
  shotTitles = $state<Map<string, string>>(new Map())

  // ============================================================================
  // USER & ENVIRONMENT
  // ============================================================================

  /** User ID for this session */
  userId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

  /** WebSocket URL */
  wsUrl = $state('')

  /** API base URL */
  apiUrl = $state('')

  /** Sheet identifier */
  sheetId = $state('test-sheet-1')

  // ============================================================================
  // UI STATE
  // ============================================================================

  /** Loading state */
  loading = $state(true)

  /** Selected thumbnail size index (0-7) */
  selectedThumbnailSize = $state(3) // Default: 256x144

  /** Sticky top row enabled */
  stickyTopRow = $state(true)

  /** Sound muted */
  isSoundMuted = $state(false)

  /** Show thumbnail size menu */
  showThumbnailMenu = $state(false)

  /** Open ellipsis menu ID */
  openEllipsisMenu = $state<string | null>(null)

  // ============================================================================
  // DRAG STATE (CARDS)
  // ============================================================================

  /** Currently dragged card */
  draggedCard = $state<DraggedCard | null>(null)

  /** Drag preview (where card will drop) */
  dragPreview = $state<DragPreview | null>(null)

  /** Is dragging active */
  isDragging = $state(false)

  /** Mouse position during drag */
  dragMousePos = $state({ x: 0, y: 0 })

  // ============================================================================
  // DRAG STATE (COLUMNS)
  // ============================================================================

  /** Currently dragged column */
  draggedColumn = $state<string | null>(null)

  /** Column drag preview */
  columnDragPreview = $state<ColumnDragPreview | null>(null)

  /** Is column dragging active */
  isColumnDragging = $state(false)

  // ============================================================================
  // MENU STATE
  // ============================================================================

  /** Open column menu ID */
  openColumnMenu = $state<string | null>(null)

  // ============================================================================
  // SCROLL REFS
  // ============================================================================

  /** Frozen row element ref */
  frozenRowRef = $state<HTMLDivElement | null>(null)

  /** Columns container element ref */
  columnsContainerRef = $state<HTMLDivElement | null>(null)

  // ============================================================================
  // MODAL STATE
  // ============================================================================

  /** Show card edit modal */
  showModal = $state(false)

  /** Card ID being edited in modal */
  modalCardId = $state<string | null>(null)

  /** Media ID being edited (for drawings) */
  modalMediaId = $state<string | null>(null)

  /** Modal prompt text */
  modalPrompt = $state('')

  /** Prompt textarea ref */
  promptTextRef = $state<HTMLTextAreaElement | null>(null)

  /** Yjs Y.Text for collaborative prompt editing */
  promptYText = $state<any | null>(null)

  /** Modal card title */
  modalTitle = $state('')

  /** Modal card color */
  modalColor = $state('#CCCCCC')

  /** Modal media URL */
  modalMediaUrl = $state<string | null>(null)

  /** Modal media type */
  modalMediaType = $state<string | null>(null)

  /** Modal thumbnail URL (for videos) */
  modalThumbUrl = $state<string | null>(null)

  /** Modal attachments */
  attachments = $state<any[]>([])

  // ============================================================================
  // CANVAS DRAWING STATE
  // ============================================================================

  /** Canvas element ref */
  canvasRef = $state<HTMLCanvasElement | null>(null)

  /** Is drawing active */
  isDrawing = $state(false)

  /** Current drawing color */
  currentColor = $state('white')

  /** Current drawing strokes */
  drawingStrokes = $state<any[]>([])

  /** Drawing history per media (for undo) */
  drawingHistory = new Map<string, any[][]>()

  /** Drawing redo stack per media */
  drawingRedoStack = new Map<string, any[][]>()

  // ============================================================================
  // CONFIRMATION DIALOG STATE
  // ============================================================================

  /** Show confirmation dialog */
  showConfirmDialog = $state(false)

  /** Confirmation message */
  confirmMessage = $state('')

  /** Confirmation callback */
  confirmCallback: (() => void) | null = null

  // ============================================================================
  // TOAST NOTIFICATION STATE
  // ============================================================================

  /** Show toast notification */
  showToast = $state(false)

  /** Toast message */
  toastMessage = $state('')

  /** Toast timeout ID */
  toastTimeout: number | null = null

  // ============================================================================
  // UNDO/REDO STATE
  // ============================================================================

  /** Undo stack */
  undoStack = $state<UndoOperation[]>([])

  /** Redo stack */
  redoStack = $state<UndoOperation[]>([])

  // ============================================================================
  // DERIVED STATE (computed from strategies)
  // ============================================================================

  /** Timeline dimension (rows or cols based on orientation) */
  timeline = $derived(
    this.orientation.getTimeline(this.rows, this.cols)
  )

  /** Lanes dimension (cols or rows based on orientation) */
  lanes = $derived(
    this.orientation.getLanes(this.rows, this.cols)
  )

  /** Fixed/frozen lane (first lane) */
  fixedLane = $derived(
    this.lanes.length > 0 ? this.lanes[0] : null
  )

  /** Display columns (includes phantom column for scrolling) */
  displayCols = $derived(
    [...this.cols, `phantom-col-${this.cols.length}`]
  )

  /** Display rows (includes phantom row for scrolling) */
  displayRows = $derived(
    [...this.rows, `phantom-row-${this.rows.length}`]
  )

  /** Current thumbnail size config */
  thumbnailSize = $derived(
    THUMBNAIL_SIZES[this.selectedThumbnailSize]
  )

  // ============================================================================
  // METHODS (delegate to strategies)
  // ============================================================================

  /**
   * Construct a cell key from semantic time/lane IDs
   * Uses orientation strategy to handle vertical/horizontal
   */
  cellKey(timeId: string, laneId: string): string {
    return this.orientation.cellKey(timeId, laneId)
  }

  /**
   * Parse a cell key back to semantic time/lane IDs
   */
  parseCellKey(key: string): { timeId: string; laneId: string } {
    return this.orientation.parseCellKey(key)
  }

  /**
   * Switch orientation strategy
   */
  setOrientation(type: 'vertical' | 'horizontal') {
    if (type === 'vertical') {
      this.orientation = new VerticalOrientation()
    } else {
      // Import HorizontalOrientation when needed
      // this.orientation = new HorizontalOrientation()
      throw new Error('Horizontal orientation not yet implemented')
    }

    // Persist preference
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('orientation', type)
    }
  }

  /**
   * Load user preferences from localStorage
   */
  loadPreferences() {
    if (typeof localStorage === 'undefined') return

    // Thumbnail size
    const thumbnailSize = localStorage.getItem('thumbnailSize')
    if (thumbnailSize) {
      const index = parseInt(thumbnailSize, 10)
      if (index >= 0 && index < THUMBNAIL_SIZES.length) {
        this.selectedThumbnailSize = index
      }
    }

    // Sound mute
    const soundMuted = localStorage.getItem('isSoundMuted')
    if (soundMuted === 'true') {
      this.isSoundMuted = true
    }

    // Sticky top row
    const stickyTopRow = localStorage.getItem('stickyTopRow')
    if (stickyTopRow === 'false') {
      this.stickyTopRow = false
    }

    // Orientation
    const orientation = localStorage.getItem('orientation')
    if (orientation === 'horizontal') {
      // Will be enabled in Phase 3
      // this.setOrientation('horizontal')
    }
  }

  /**
   * Save preference to localStorage
   */
  savePreference(key: string, value: string | number | boolean) {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, String(value))
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Get all cards in a specific lane
   */
  getCardsInLane(laneId: string): { timeId: string; cardId: string; card: any }[] {
    const cards: { timeId: string; cardId: string; card: any }[] = []

    for (const timeId of this.timeline) {
      const key = this.cellKey(timeId, laneId)
      const cell = this.cellsMap.get(key)

      if (cell?.cardId) {
        const card = this.cardsMetadata.get(cell.cardId)
        if (card) {
          cards.push({ timeId, cardId: cell.cardId, card })
        }
      }
    }

    return cards
  }

  /**
   * Get all cards in a specific time slot
   */
  getCardsInTime(timeId: string): { laneId: string; cardId: string; card: any }[] {
    const cards: { laneId: string; cardId: string; card: any }[] = []

    for (const laneId of this.lanes) {
      const key = this.cellKey(timeId, laneId)
      const cell = this.cellsMap.get(key)

      if (cell?.cardId) {
        const card = this.cardsMetadata.get(cell.cardId)
        if (card) {
          cards.push({ laneId, cardId: cell.cardId, card })
        }
      }
    }

    return cards
  }
}
