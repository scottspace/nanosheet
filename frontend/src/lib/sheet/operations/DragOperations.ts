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
  private lastDragOverTime: number = 0
  private autoScrollInterval: number | null = null

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

      // Center the drag image on the cursor for better visual feedback
      // Get the element being dragged
      const target = event.target as HTMLElement
      if (target) {
        const rect = target.getBoundingClientRect()
        // Set drag image offset to center of the card
        const offsetX = rect.width / 2
        const offsetY = rect.height / 2
        event.dataTransfer.setDragImage(target, offsetX, offsetY)
      }
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

    // Throttle to ~60fps to prevent excessive processing
    const now = Date.now()
    if (now - this.lastDragOverTime < 16) {
      return
    }
    this.lastDragOverTime = now

    if (!this.state.draggedCard || !this.state.isDragging) {
      return
    }

    const timeline = this.getTimeline()

    // Calculate insert position using orientation-aware logic
    const rect = cardElement.getBoundingClientRect()
    const mousePos = { x: event.clientX, y: event.clientY }
    const insertBefore = this.state.orientation.calculateInsertBefore(rect, mousePos)

    // Skip frozen time position as drop target ONLY if trying to insert before it
    // Allow inserting after the frozen row (which puts card in position 1)
    if (timeline.length > 0 && targetTime === timeline[0] && insertBefore) {
      this.state.dragPreview = null
      console.log('[DragOperations.handleDragOver] Skipped - cannot insert before frozen header row')
      return
    }

    // Don't show preview if it's the same cell
    if (this.state.draggedCard.timeId === targetTime && this.state.draggedCard.laneId === targetLane) {
      this.state.dragPreview = null
      return
    }

    // Check if this would be a no-op move (dragging to adjacent position that results in same final position)
    // Only check if in the same lane
    if (this.state.draggedCard.laneId === targetLane) {
      const draggedIndex = timeline.indexOf(this.state.draggedCard.timeId)
      const targetIndex = timeline.indexOf(targetTime)
      const insertAtIndex = insertBefore ? targetIndex : targetIndex + 1

      // If the insert position is the same as current position, or directly after current position
      // (which would be the same after removing the dragged card), don't show preview
      if (insertAtIndex === draggedIndex || insertAtIndex === draggedIndex + 1) {
        this.state.dragPreview = null
        return
      }
    }

    // Track mouse position
    this.state.dragMousePos = { x: event.clientX, y: event.clientY }

    // Auto-scroll when dragging near viewport edges
    this.handleAutoScroll(event.clientY)

    // Only update preview if it changed (avoid excessive reactivity triggers)
    const currentPreview = this.state.dragPreview
    if (!currentPreview ||
        currentPreview.targetLane !== targetLane ||
        currentPreview.targetTime !== targetTime ||
        currentPreview.insertBefore !== insertBefore) {
      this.state.dragPreview = {
        targetLane,
        targetTime,
        insertBefore
      }
    }

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

    // Stop auto-scrolling
    this.stopAutoScroll()
  }

  /**
   * Handle auto-scrolling when dragging near viewport edges
   *
   * @param mouseY - Current mouse Y position
   */
  private handleAutoScroll(mouseY: number): void {
    const scrollThreshold = 100 // Distance from edge to trigger scroll
    const scrollSpeed = 10 // Pixels to scroll per frame

    const viewportHeight = window.innerHeight
    const distanceFromTop = mouseY
    const distanceFromBottom = viewportHeight - mouseY

    // Determine scroll direction
    let scrollDirection: 'up' | 'down' | null = null

    if (distanceFromTop < scrollThreshold) {
      scrollDirection = 'up'
    } else if (distanceFromBottom < scrollThreshold) {
      scrollDirection = 'down'
    }

    // Start/stop auto-scroll based on direction
    if (scrollDirection) {
      if (!this.autoScrollInterval) {
        this.startAutoScroll(scrollDirection, scrollSpeed)
      }
    } else {
      this.stopAutoScroll()
    }
  }

  /**
   * Start auto-scrolling in the specified direction
   *
   * @param direction - 'up' or 'down'
   * @param speed - Pixels to scroll per frame
   */
  private startAutoScroll(direction: 'up' | 'down', speed: number): void {
    this.stopAutoScroll() // Clear any existing interval

    this.autoScrollInterval = window.setInterval(() => {
      const scrollAmount = direction === 'up' ? -speed : speed
      window.scrollBy(0, scrollAmount)
    }, 16) as unknown as number // ~60fps
  }

  /**
   * Stop auto-scrolling
   */
  private stopAutoScroll(): void {
    if (this.autoScrollInterval) {
      clearInterval(this.autoScrollInterval)
      this.autoScrollInterval = null
    }
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

    if (!sheet || !this.state.draggedCard) {
      console.log('[DragOperations.handleDrop] Missing required data:', {
        hasSheet: !!sheet,
        hasDraggedCard: !!this.state.draggedCard
      })
      this.state.isDragging = false
      this.state.dragPreview = null
      this.state.draggedCard = null
      return
    }

    const { timeId: fromTime, laneId: fromLane, cardId } = this.state.draggedCard

    // ALWAYS use dragPreview position - this is where the placeholder showed
    // Only fall back to drop event target if dragPreview doesn't exist (shouldn't happen)
    if (!this.state.dragPreview) {
      console.warn('[DragOperations.handleDrop] No dragPreview! Using drop event target')
      this.state.isDragging = false
      this.state.draggedCard = null
      return
    }

    let targetTime = this.state.dragPreview.targetTime
    let targetLane = this.state.dragPreview.targetLane
    const insertBefore = this.state.dragPreview.insertBefore

    console.log('=== DROP POSITION ANALYSIS ===')
    console.log('[PLACEHOLDER] Where placeholder was shown:', {
      targetTime,
      targetLane,
      insertBefore: insertBefore ? 'BEFORE' : 'AFTER'
    })
    console.log('[SOURCE] Dragging from:', {
      fromTime,
      fromLane,
      cardId
    })

    // Handle drops on phantom columns - create new column first
    if (targetLane.startsWith('phantom-col-')) {
      const newColId = `c-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`
      sheet.colOrder.push([newColId])
      targetLane = newColId
      console.log('[DragOperations.handleDrop] Created new column:', newColId)

      // Create frozen header card for the new lane
      const timeline = this.getTimeline()
      if (timeline.length > 0) {
        const frozenTime = timeline[0]
        const headerCardId = `card-${Date.now()}-header-${Math.random().toString(36).substring(2, 9)}`
        const headerKey = this.strategy.cellKey(frozenTime, newColId)
        sheet.cells.set(headerKey, { cardId: headerCardId })

        // Create default header card metadata
        const headerCard = {
          cardId: headerCardId,
          title: 'New Lane',
          color: '#CCCCCC',
          prompt: '',
          createdAt: new Date().toISOString()
        }

        // Add to cardsMetadata
        const cardMap = new Y.Map()
        for (const [key, value] of Object.entries(headerCard)) {
          cardMap.set(key, value)
        }
        sheet.cardsMetadata.set(headerCardId, cardMap)
        console.log('[DragOperations.handleDrop] Created header card for new lane:', headerCardId)
      }
    }

    // Handle drops on phantom rows - create new row first
    if (targetTime.startsWith('phantom-row-')) {
      const newRowId = `r-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`
      sheet.rowOrder.push([newRowId])
      targetTime = newRowId
      console.log('[DragOperations.handleDrop] Created new row:', newRowId)
    }

    // Kanban-style move: shift cards within lanes
    // Use Yjs transaction to batch all cell operations for better performance
    sheet.doc.transact(() => {
      // Step 1: Remove card from source
      const fromKey = this.strategy.cellKey(fromTime, fromLane)
      const cardData = sheet.cells.get(fromKey)

      if (!cardData) {
        console.log('[DragOperations.handleDrop] Card not found at source')
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

    console.log('[CALCULATION] Insert position:', {
      targetTimeIndex,
      insertBefore,
      insertAtIndex,
      timelineLength: allTimes.length,
      targetTimeInTimeline: allTimes[targetTimeIndex],
      insertTimeInTimeline: allTimes[insertAtIndex]
    })

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

      // Step 5: Place card at target position temporarily
      const tempKey = this.strategy.cellKey(allTimes[insertAtIndex], targetLane)
      sheet.cells.set(tempKey, cardData)
      console.log('[DragOperations.handleDrop] Placed at:', tempKey)

      // Step 6: Compact the target lane (remove gaps, solitaire-style)
      // Preserve frozen header card (position 0) and collect only non-frozen cards
      const frozenHeaderKey = this.strategy.cellKey(allTimes[0], targetLane)
      const frozenHeaderCard = sheet.cells.get(frozenHeaderKey)

      // Collect all cards in the target lane EXCEPT the frozen header (start from position 1)
      const cardsInLane: Array<{ card: any; originalIndex: number }> = []
      for (let i = 1; i < allTimes.length; i++) {
        const key = this.strategy.cellKey(allTimes[i], targetLane)
        const card = sheet.cells.get(key)
        if (card) {
          cardsInLane.push({ card, originalIndex: i })
        }
      }

      // Clear all cards from the lane EXCEPT the frozen header
      for (let i = 1; i < allTimes.length; i++) {
        const key = this.strategy.cellKey(allTimes[i], targetLane)
        sheet.cells.delete(key)
      }

      // Place cards back compacted starting from position 1 (after frozen header)
      const startIndex = 1 // Skip frozen header row at position 0
      let finalKey = tempKey
      for (let i = 0; i < cardsInLane.length; i++) {
        const compactKey = this.strategy.cellKey(allTimes[startIndex + i], targetLane)
        sheet.cells.set(compactKey, cardsInLane[i].card)

        // Track where our dragged card ended up
        if (cardsInLane[i].card.cardId === cardId) {
          finalKey = compactKey
        }
      }

      console.log('[DragOperations.handleDrop] Compacted lane:', targetLane, 'cards:', cardsInLane.length)

      // Save to undo stack (still using row/col for backward compatibility with undo logic)
      const { timeId: finalTime, laneId: finalLane } = this.strategy.parseCellKey(finalKey)

      console.log('[ACTUAL DROP] Card ended up at:', {
        finalTime,
        finalLane,
        finalKey,
        calculatedInsertIndex: insertBefore ? targetTimeIndex : targetTimeIndex + 1
      })
      console.log('=== END DROP ANALYSIS ===\n')
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
    }) // End of Yjs transaction - all cell ops batched into one sync

    // Clear drag state
    this.state.isDragging = false
    this.state.dragPreview = null
    this.state.draggedCard = null
  }
}
