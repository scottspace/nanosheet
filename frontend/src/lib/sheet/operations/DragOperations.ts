/**
 * DragOperations - Handles card drag and drop operations
 *
 * This class encapsulates all logic for dragging and dropping cards within the sheet,
 * including visual preview updates, card movement between lanes/times, and proper
 * Kanban-style shifting of cards to fill gaps.
 */

import type { OrientationStrategy } from '../strategies/orientation/OrientationStrategy'
import type { SheetConnection } from '../../ySheet'

/**
 * Drag state for tracking card being dragged
 */
export interface DraggedCard {
  timeId: string
  laneId: string
  cardId: string
}

/**
 * Preview state for visual drop indicator
 */
export interface DragPreview {
  targetLane: string
  targetTime: string
  insertBefore: boolean
}

/**
 * Mouse position for drag tracking
 */
export interface DragMousePosition {
  x: number
  y: number
}

/**
 * Callbacks for recording undo operations
 */
export interface DragOperationCallbacks {
  /**
   * Record an undo operation for a card move
   */
  onRecordUndo: (operation: {
    type: 'move'
    userId: string
    cardId: string
    fromRow: string
    fromCol: string
    toRow: string
    toCol: string
  }) => void

  /**
   * Clear the redo stack after a new operation
   */
  onClearRedo: () => void
}

/**
 * State container for drag operations
 */
export interface DragState {
  draggedCard: DraggedCard | null
  dragPreview: DragPreview | null
  isDragging: boolean
  dragMousePos: DragMousePosition
}

/**
 * DragOperations class manages card drag and drop
 */
export class DragOperations {
  private strategy: OrientationStrategy
  private state: DragState
  private callbacks: DragOperationCallbacks
  private userId: string
  private getSheet: () => SheetConnection | null
  private getTimeline: () => string[]

  /**
   * Constructor
   *
   * @param strategy - Orientation strategy for coordinate mapping
   * @param state - Reactive drag state object (will be mutated)
   * @param callbacks - Callbacks for undo/redo tracking
   * @param userId - Current user ID for undo tracking
   * @param getSheet - Function that returns current SheetConnection
   * @param getTimeline - Function that returns current timeline array
   */
  constructor(
    strategy: OrientationStrategy,
    state: DragState,
    callbacks: DragOperationCallbacks,
    userId: string,
    getSheet: () => SheetConnection | null,
    getTimeline: () => string[]
  ) {
    this.strategy = strategy
    this.state = state
    this.callbacks = callbacks
    this.userId = userId
    this.getSheet = getSheet
    this.getTimeline = getTimeline
  }

  /**
   * Handle drag start event
   *
   * Initiates a card drag operation. Prevents dragging cards from the frozen
   * time position (first time slot, which is the header row in vertical mode).
   *
   * @param event - DragEvent from the browser
   * @param timeId - Time position of the card being dragged
   * @param laneId - Lane position of the card being dragged
   * @param cardId - ID of the card being dragged
   */
  handleDragStart(event: DragEvent, timeId: string, laneId: string, cardId: string): void {
    const timeline = this.getTimeline()

    // Skip frozen time position (first time slot, which is the header row in vertical mode)
    if (timeline.length > 0 && timeId === timeline[0]) {
      event.preventDefault()
      return
    }

    this.state.draggedCard = { timeId, laneId, cardId }
    this.state.isDragging = true
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', cardId)
    }
    console.log('[DragOperations.handleDragStart] Started dragging:', cardId)
  }

  /**
   * Handle drag over event
   *
   * Updates the visual preview indicator showing where the card would be dropped.
   * Calculates whether to insert before or after the target card based on mouse position.
   *
   * @param event - DragEvent from the browser
   * @param targetTime - Time position being hovered over
   * @param targetLane - Lane position being hovered over
   * @param cardElement - DOM element of the card being hovered over
   */
  handleDragOver(event: DragEvent, targetTime: string, targetLane: string, cardElement: HTMLElement): void {
    event.preventDefault()
    if (!this.state.draggedCard || !this.state.isDragging) {
      console.log('[DragOperations.handleDragOver] Skipped - no draggedCard or not dragging')
      return
    }

    const timeline = this.getTimeline()

    // Skip frozen time position as drop target (first time slot, which is header row in vertical mode)
    if (timeline.length > 0 && targetTime === timeline[0]) {
      this.state.dragPreview = null
      console.log('[DragOperations.handleDragOver] Skipped - frozen time position')
      return
    }

    // Don't show preview if it's the same cell
    if (this.state.draggedCard.timeId === targetTime && this.state.draggedCard.laneId === targetLane) {
      this.state.dragPreview = null
      return
    }

    // Track mouse position
    this.state.dragMousePos = { x: event.clientX, y: event.clientY }

    // Calculate if mouse is in top or bottom half of card (vertical orientation)
    // In future phases, this will adapt based on orientation
    const rect = cardElement.getBoundingClientRect()
    const mouseY = event.clientY
    const cardMidpoint = rect.top + (rect.height / 2)
    const insertBefore = mouseY < cardMidpoint

    // Update preview
    this.state.dragPreview = {
      targetLane,
      targetTime,
      insertBefore
    }

    console.log('[DragOperations.handleDragOver] Updated preview:', { targetTime, targetLane, insertBefore })

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
  }

  /**
   * Handle drag end event
   *
   * Cleans up drag state when drag operation ends (whether successful or cancelled).
   *
   * @param event - DragEvent from the browser
   */
  handleDragEnd(event: DragEvent): void {
    console.log('[DragOperations.handleDragEnd] Drag ended')
    this.state.isDragging = false
    this.state.dragPreview = null
    this.state.draggedCard = null
  }

  /**
   * Handle drop event
   *
   * Performs the actual card move operation with Kanban-style shifting:
   * 1. Remove card from source position
   * 2. Shift cards in source lane to fill the gap (shift forward in time)
   * 3. Shift cards in target lane to make room (shift backward in time)
   * 4. Place card at target position
   * 5. Record undo operation
   *
   * @param event - DragEvent from the browser
   * @param toTime - Time position where card was dropped
   * @param toLane - Lane position where card was dropped
   */
  handleDrop(event: DragEvent, toTime: string, toLane: string): void {
    event.preventDefault()
    const sheet = this.getSheet()

    if (!sheet || !this.state.draggedCard || !this.state.dragPreview) {
      console.log('[DragOperations.handleDrop] Missing required data:', {
        hasSheet: !!sheet,
        hasDraggedCard: !!this.state.draggedCard,
        hasDragPreview: !!this.state.dragPreview
      })
      this.state.isDragging = false
      this.state.dragPreview = null
      this.state.draggedCard = null
      return
    }

    const { timeId: fromTime, laneId: fromLane, cardId } = this.state.draggedCard
    const { targetTime, targetLane, insertBefore } = this.state.dragPreview

    console.log('[DragOperations.handleDrop] Dropping card:', {
      fromTime, fromLane, cardId,
      targetTime, targetLane, insertBefore,
      dropEventTime: toTime, dropEventLane: toLane
    })

    // Kanban-style move: shift cards within lanes
    // Step 1: Remove card from source
    const fromKey = this.strategy.cellKey(fromTime, fromLane)
    const cardData = sheet.cells.get(fromKey)

    if (!cardData) {
      console.log('[DragOperations.handleDrop] Card not found at source')
      this.state.isDragging = false
      this.state.dragPreview = null
      this.state.draggedCard = null
      return
    }

    sheet.cells.delete(fromKey)
    console.log('[DragOperations.handleDrop] Removed from:', fromKey)

    // Step 2: Get all time points and find positions
    const allTimes = this.getTimeline()
    const fromTimeIndex = allTimes.indexOf(fromTime)
    const targetTimeIndex = allTimes.indexOf(targetTime)

    // Step 3: Shift cards in source lane to fill the gap (shift forward in time)
    if (fromLane === targetLane) {
      // Same lane - just need to shift and reorder
      for (let i = fromTimeIndex + 1; i < allTimes.length; i++) {
        const currentKey = this.strategy.cellKey(allTimes[i], fromLane)
        const prevKey = this.strategy.cellKey(allTimes[i - 1], fromLane)
        const card = sheet.cells.get(currentKey)
        if (card) {
          sheet.cells.delete(currentKey)
          sheet.cells.set(prevKey, card)
        }
      }
    } else {
      // Different lanes - shift source lane forward in time
      for (let i = fromTimeIndex + 1; i < allTimes.length; i++) {
        const currentKey = this.strategy.cellKey(allTimes[i], fromLane)
        const prevKey = this.strategy.cellKey(allTimes[i - 1], fromLane)
        const card = sheet.cells.get(currentKey)
        if (card) {
          sheet.cells.delete(currentKey)
          sheet.cells.set(prevKey, card)
        }
      }
    }

    // Step 4: Shift cards in target lane backward in time from target position
    const insertAtIndex = insertBefore ? targetTimeIndex : targetTimeIndex + 1

    // Shift cards backward starting from the end
    for (let i = allTimes.length - 1; i >= insertAtIndex; i--) {
      const currentKey = this.strategy.cellKey(allTimes[i], targetLane)
      const nextKey = this.strategy.cellKey(allTimes[i + 1], targetLane)
      const card = sheet.cells.get(currentKey)
      if (card && i + 1 < allTimes.length) {
        sheet.cells.delete(currentKey)
        sheet.cells.set(nextKey, card)
      }
    }

    // Step 5: Place card at target
    const finalKey = this.strategy.cellKey(allTimes[insertAtIndex], targetLane)
    sheet.cells.set(finalKey, cardData)
    console.log('[DragOperations.handleDrop] Placed at:', finalKey)

    // Save to undo stack (still using row/col for backward compatibility with undo logic)
    const { timeId: finalTime, laneId: finalLane } = this.strategy.parseCellKey(finalKey)
    this.callbacks.onRecordUndo({
      type: 'move',
      userId: this.userId,
      cardId: cardId,
      fromRow: this.strategy.name === 'vertical' ? fromTime : fromLane,
      fromCol: this.strategy.name === 'vertical' ? fromLane : fromTime,
      toRow: this.strategy.name === 'vertical' ? finalTime : finalLane,
      toCol: this.strategy.name === 'vertical' ? finalLane : finalTime
    })
    this.callbacks.onClearRedo()

    // Clear drag state
    this.state.isDragging = false
    this.state.dragPreview = null
    this.state.draggedCard = null
  }
}
