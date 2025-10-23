/**
 * ColumnDragOperations - Handles column/lane drag and drop operations
 *
 * This class encapsulates all logic for dragging and reordering entire lanes (columns in
 * vertical mode, rows in horizontal mode). It includes custom drag image generation showing
 * all cards in the lane, visual preview of drop position, and proper reordering in Yjs.
 */

import type { OrientationStrategy } from '../strategies/orientation/OrientationStrategy'
import type { SheetConnection } from '../../ySheet'

/**
 * Preview state for column drop indicator
 */
export interface ColumnDragPreview {
  targetColIndex: number
  insertBefore: boolean
}

/**
 * Callbacks for column drag operations
 */
export interface ColumnDragOperationCallbacks {
  /**
   * Record an undo operation for lane reordering
   */
  onRecordUndo: (operation: {
    type: 'reorderColumn'
    userId: string
    colId: string
    fromIndex: number
    toIndex: number
  }) => void

  /**
   * Clear the redo stack after a new operation
   */
  onClearRedo: () => void
}

/**
 * State container for column drag operations
 */
export interface ColumnDragState {
  draggedColumn: string | null
  columnDragPreview: ColumnDragPreview | null
  isColumnDragging: boolean
}

/**
 * Thumbnail size configuration for drag preview
 */
export interface ThumbnailSizeConfig {
  width: number
  height: number
}

/**
 * ColumnDragOperations class manages lane drag and drop
 */
export class ColumnDragOperations {
  private strategy: OrientationStrategy
  private state: ColumnDragState
  private callbacks: ColumnDragOperationCallbacks
  private userId: string
  private getSheet: () => SheetConnection | null
  private getLanes: () => string[]
  private getTimeline: () => string[]
  private getCellsMap: () => Map<string, { cardId: string }>
  private getCardsMetadata: () => Map<string, any>
  private getThumbnailSize: () => ThumbnailSizeConfig

  /**
   * Constructor
   *
   * @param strategy - Orientation strategy for coordinate mapping
   * @param state - Reactive column drag state object (will be mutated)
   * @param callbacks - Callbacks for undo/redo tracking
   * @param userId - Current user ID for undo tracking
   * @param getSheet - Function that returns current SheetConnection
   * @param getLanes - Function that returns current lanes array
   * @param getTimeline - Function that returns current timeline array
   * @param getCellsMap - Function that returns current cells map
   * @param getCardsMetadata - Function that returns current cards metadata
   * @param getThumbnailSize - Function that returns current thumbnail size config
   */
  constructor(
    strategy: OrientationStrategy,
    state: ColumnDragState,
    callbacks: ColumnDragOperationCallbacks,
    userId: string,
    getSheet: () => SheetConnection | null,
    getLanes: () => string[],
    getTimeline: () => string[],
    getCellsMap: () => Map<string, { cardId: string }>,
    getCardsMetadata: () => Map<string, any>,
    getThumbnailSize: () => ThumbnailSizeConfig
  ) {
    this.strategy = strategy
    this.state = state
    this.callbacks = callbacks
    this.userId = userId
    this.getSheet = getSheet
    this.getLanes = getLanes
    this.getTimeline = getTimeline
    this.getCellsMap = getCellsMap
    this.getCardsMetadata = getCardsMetadata
    this.getThumbnailSize = getThumbnailSize
  }

  /**
   * Handle column drag start event
   *
   * Initiates a lane drag operation and creates a custom drag image showing
   * all cards in the lane stacked vertically.
   *
   * @param e - DragEvent from the browser
   * @param laneId - ID of the lane being dragged
   */
  handleColumnDragStart(e: DragEvent, laneId: string): void {
    this.state.draggedColumn = laneId
    this.state.isColumnDragging = true

    // Set drag data
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', laneId)

      // Create a custom drag image showing the entire lane
      const dragPreview = document.createElement('div')
      dragPreview.style.position = 'absolute'
      dragPreview.style.top = '-9999px'
      dragPreview.style.left = '-9999px'
      dragPreview.style.display = 'flex'
      dragPreview.style.flexDirection = 'column'
      const thumbnailSize = this.getThumbnailSize()
      dragPreview.style.gap = `${thumbnailSize.width * 0.035}px`
      dragPreview.style.opacity = '0.7'
      dragPreview.style.pointerEvents = 'none'

      // Find all cards in this lane
      const lanes = this.getLanes()
      const timeline = this.getTimeline()
      const cellsMap = this.getCellsMap()
      const cardsMetadata = this.getCardsMetadata()

      const laneIndex = lanes.indexOf(laneId)
      const laneCards = timeline.map(timeId => {
        const key = this.strategy.cellKey(timeId, laneId)
        const cell = cellsMap.get(key)
        const cardId = cell?.cardId
        return cardId ? cardsMetadata.get(cardId) : null
      }).filter(card => card !== null)

      // Add card previews to the drag image
      laneCards.forEach(card => {
        const cardDiv = document.createElement('div')
        cardDiv.style.width = `${thumbnailSize.width}px`
        cardDiv.style.height = `${thumbnailSize.height}px`
        cardDiv.style.backgroundColor = card.color
        cardDiv.style.borderRadius = '8px'
        cardDiv.style.display = 'flex'
        cardDiv.style.alignItems = 'center'
        cardDiv.style.justifyContent = 'center'
        cardDiv.style.color = 'rgba(255, 255, 255, 0.9)'
        cardDiv.style.fontSize = '0.75rem'
        cardDiv.style.padding = '0.5rem'
        cardDiv.style.textAlign = 'center'
        cardDiv.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)'
        cardDiv.textContent = card.title
        dragPreview.appendChild(cardDiv)
      })

      document.body.appendChild(dragPreview)

      // Calculate total height of the column preview
      const cardHeight = thumbnailSize.height
      const gap = thumbnailSize.width * 0.035
      const totalHeight = laneCards.length * cardHeight + (laneCards.length - 1) * gap

      // Position cursor at center of column (horizontally and vertically)
      // This ensures dragover events fire when any part of the column overlaps a drop zone
      const xOffset = thumbnailSize.width / 2
      const yOffset = totalHeight / 2

      e.dataTransfer.setDragImage(dragPreview, xOffset, yOffset)

      // Remove the preview element after a brief delay
      setTimeout(() => {
        document.body.removeChild(dragPreview)
      }, 0)
    }

    console.log('[ColumnDragOperations.handleColumnDragStart] Dragging lane:', laneId)
  }

  /**
   * Handle column drag over event
   *
   * Updates the visual preview indicator showing where the lane would be dropped.
   * Calculates whether to insert before or after the target lane based on mouse position.
   *
   * @param e - DragEvent from the browser
   * @param targetLaneId - ID of the lane being hovered over
   */
  handleColumnDragOver(e: DragEvent, targetLaneId: string): void {
    e.preventDefault()

    if (!this.state.draggedColumn || this.state.draggedColumn === targetLaneId) {
      this.state.columnDragPreview = null
      return
    }

    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move'
    }

    // Calculate if we should insert before or after the target
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const midpoint = rect.left + rect.width / 2
    const insertBefore = e.clientX < midpoint

    const lanes = this.getLanes()
    const sourceIndex = lanes.indexOf(this.state.draggedColumn)
    const targetIndex = lanes.indexOf(targetLaneId)

    if (targetIndex === -1 || sourceIndex === -1) return

    // Calculate what the final index would be
    let finalIndex = insertBefore ? targetIndex : targetIndex + 1

    // Adjust if dragging from left to right
    if (sourceIndex < finalIndex) {
      finalIndex--
    }

    // Don't show preview if the column would end up in the same position
    if (sourceIndex === finalIndex) {
      this.state.columnDragPreview = null
      return
    }

    this.state.columnDragPreview = {
      targetColIndex: targetIndex,
      insertBefore
    }
  }

  /**
   * Handle column drop event
   *
   * Performs the actual lane reordering operation:
   * 1. Validate drag state and indices
   * 2. Calculate final insert position
   * 3. Reorder lanes in Yjs
   * 4. Record undo operation
   *
   * @param e - DragEvent from the browser
   * @param targetLaneId - ID of the lane where the drop occurred
   */
  handleColumnDrop(e: DragEvent, targetLaneId: string): void {
    e.preventDefault()
    e.stopPropagation()

    console.log('[ColumnDragOperations.handleColumnDrop] Drop event', {
      draggedColumn: this.state.draggedColumn,
      targetLaneId
    })

    if (!this.state.draggedColumn || this.state.draggedColumn === targetLaneId) {
      console.log('[ColumnDragOperations.handleColumnDrop] Early exit:', {
        draggedColumn: this.state.draggedColumn,
        sameTarget: this.state.draggedColumn === targetLaneId
      })
      this.resetColumnDrag()
      return
    }

    const sheet = this.getSheet()
    if (!sheet) {
      console.log('[ColumnDragOperations.handleColumnDrop] No sheet available')
      this.resetColumnDrag()
      return
    }

    // Get the lane order array from Yjs (use colOrder in vertical mode, rowOrder in horizontal)
    const laneOrder = this.strategy.name === 'vertical' ? sheet.colOrder : sheet.rowOrder
    const lanesArray = laneOrder.toArray()

    console.log('[ColumnDragOperations.handleColumnDrop] Lanes array:', lanesArray)

    const sourceIndex = lanesArray.indexOf(this.state.draggedColumn)
    const targetIndex = lanesArray.indexOf(targetLaneId)

    console.log('[ColumnDragOperations.handleColumnDrop] Indices:', { sourceIndex, targetIndex })

    if (sourceIndex === -1 || targetIndex === -1) {
      console.log('[ColumnDragOperations.handleColumnDrop] Invalid indices, exiting')
      this.resetColumnDrag()
      return
    }

    // Determine final insert position
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const midpoint = rect.left + rect.width / 2
    const insertBefore = e.clientX < midpoint

    let finalIndex = insertBefore ? targetIndex : targetIndex + 1

    // Adjust if dragging from left to right
    if (sourceIndex < finalIndex) {
      finalIndex--
    }

    console.log('[ColumnDragOperations.handleColumnDrop] Final index calculation:', { insertBefore, finalIndex })

    if (sourceIndex !== finalIndex) {
      // Save to undo stack
      this.callbacks.onRecordUndo({
        type: 'reorderColumn',
        userId: this.userId,
        colId: this.state.draggedColumn,
        fromIndex: sourceIndex,
        toIndex: finalIndex
      })
      this.callbacks.onClearRedo()

      // Reorder in Yjs
      const [movedLane] = lanesArray.splice(sourceIndex, 1)
      lanesArray.splice(finalIndex, 0, movedLane)

      console.log('[ColumnDragOperations.handleColumnDrop] New lanes array:', lanesArray)

      // Update Yjs
      laneOrder.delete(0, laneOrder.length)
      laneOrder.push(lanesArray)

      console.log('[ColumnDragOperations.handleColumnDrop] Reordered lane', this.state.draggedColumn, 'from', sourceIndex, 'to', finalIndex)
    } else {
      console.log('[ColumnDragOperations.handleColumnDrop] No reorder needed, sourceIndex === finalIndex')
    }

    this.resetColumnDrag()
  }

  /**
   * Reset column drag state
   *
   * Clears all drag-related state after a drag operation completes or is cancelled.
   */
  resetColumnDrag(): void {
    this.state.draggedColumn = null
    this.state.isColumnDragging = false
    this.state.columnDragPreview = null
  }
}
