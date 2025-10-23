/**
 * UndoRedoOperations - Handles undo and redo operations
 *
 * This class encapsulates all logic for undoing and redoing user operations including:
 * - Card moves (with proper Kanban-style shifting)
 * - Card deletions (with lane shifting)
 * - Card insertions
 * - Card edits (title, color, prompt)
 * - Lane reordering
 * - Lane duplication
 * - Lane deletion
 *
 * Each operation type has specific undo/redo logic that reverses or reapplies
 * the original action while maintaining data consistency.
 */

import type { OrientationStrategy } from '../strategies/orientation/OrientationStrategy'
import type { SheetConnection } from '../../ySheet'

/**
 * Undo operation types
 */
export interface UndoOperation {
  type: 'delete' | 'edit' | 'move' | 'insert' | 'deleteColumn' | 'duplicateColumn' | 'reorderColumn'
  userId: string  // Track which user performed this operation

  // For delete and insert operations
  rowId?: string
  colId?: string
  cardId?: string

  // For move operations
  fromRow?: string
  fromCol?: string
  toRow?: string
  toCol?: string

  // For edit operations
  previousState?: {
    cardId: string
    title: string
    color: string
    prompt: string
  }

  // For column operations
  columnIndex?: number
  columnCells?: Map<string, { cardId: string }>  // All cells in the column
  sourceColId?: string
  targetColId?: string
  fromIndex?: number
  toIndex?: number
}

/**
 * State container for undo/redo stacks
 */
export interface UndoRedoState {
  undoStack: UndoOperation[]
  redoStack: UndoOperation[]
}

/**
 * UndoRedoOperations class manages undo and redo
 */
export class UndoRedoOperations {
  private strategy: OrientationStrategy
  private state: UndoRedoState
  private userId: string
  private apiUrl: string
  private getSheet: () => SheetConnection | null
  private getTimeline: () => string[]
  private getCardsMetadata: () => Map<string, any>
  private getOrientation: () => 'vertical' | 'horizontal'

  /**
   * Constructor
   *
   * @param strategy - Orientation strategy for coordinate mapping
   * @param state - Reactive undo/redo state object (will be mutated)
   * @param userId - Current user ID for filtering operations
   * @param apiUrl - API URL for card restoration
   * @param getSheet - Function that returns current SheetConnection
   * @param getTimeline - Function that returns current timeline array
   * @param getCardsMetadata - Function that returns current cards metadata
   * @param getOrientation - Function that returns current orientation
   */
  constructor(
    strategy: OrientationStrategy,
    state: UndoRedoState,
    userId: string,
    apiUrl: string,
    getSheet: () => SheetConnection | null,
    getTimeline: () => string[],
    getCardsMetadata: () => Map<string, any>,
    getOrientation: () => 'vertical' | 'horizontal'
  ) {
    this.strategy = strategy
    this.state = state
    this.userId = userId
    this.apiUrl = apiUrl
    this.getSheet = getSheet
    this.getTimeline = getTimeline
    this.getCardsMetadata = getCardsMetadata
    this.getOrientation = getOrientation
  }

  /**
   * Undo the last operation by the current user
   *
   * Finds the most recent operation by the current user in the undo stack
   * and reverses it, moving it to the redo stack.
   */
  async handleUndo(): Promise<void> {
    if (this.state.undoStack.length === 0) {
      console.log('[UndoRedoOperations.handleUndo] Nothing to undo')
      return
    }

    // Find the last operation by the current user
    let operationIndex = -1
    for (let i = this.state.undoStack.length - 1; i >= 0; i--) {
      if (this.state.undoStack[i].userId === this.userId) {
        operationIndex = i
        break
      }
    }

    if (operationIndex === -1) {
      console.log('[UndoRedoOperations.handleUndo] No operations by current user to undo')
      return
    }

    // Remove the operation from the stack
    const operation = this.state.undoStack.splice(operationIndex, 1)[0]
    console.log('[UndoRedoOperations.handleUndo] Undoing operation:', operation)

    const sheet = this.getSheet()
    if (!sheet) {
      console.log('[UndoRedoOperations.handleUndo] No sheet available')
      return
    }

    if (operation.type === 'move') {
      await this.undoMove(operation, sheet)
    } else if (operation.type === 'delete') {
      await this.undoDelete(operation, sheet)
    } else if (operation.type === 'insert') {
      await this.undoInsert(operation, sheet)
    } else if (operation.type === 'edit') {
      await this.undoEdit(operation, sheet)
    } else if (operation.type === 'reorderColumn') {
      await this.undoReorderColumn(operation, sheet)
    } else if (operation.type === 'duplicateColumn') {
      await this.undoDuplicateColumn(operation, sheet)
    } else if (operation.type === 'deleteColumn') {
      await this.undoDeleteColumn(operation, sheet)
    }
  }

  /**
   * Redo the last undone operation by the current user
   *
   * Finds the most recent operation by the current user in the redo stack
   * and reapplies it, moving it back to the undo stack.
   */
  async handleRedo(): Promise<void> {
    if (this.state.redoStack.length === 0) {
      console.log('[UndoRedoOperations.handleRedo] Nothing to redo')
      return
    }

    // Find the last operation by the current user
    let operationIndex = -1
    for (let i = this.state.redoStack.length - 1; i >= 0; i--) {
      if (this.state.redoStack[i].userId === this.userId) {
        operationIndex = i
        break
      }
    }

    if (operationIndex === -1) {
      console.log('[UndoRedoOperations.handleRedo] No operations by current user to redo')
      return
    }

    // Remove the operation from the stack
    const operation = this.state.redoStack.splice(operationIndex, 1)[0]
    console.log('[UndoRedoOperations.handleRedo] Redoing operation:', operation)

    const sheet = this.getSheet()
    if (!sheet) {
      console.log('[UndoRedoOperations.handleRedo] No sheet available')
      return
    }

    if (operation.type === 'move') {
      await this.redoMove(operation, sheet)
    } else if (operation.type === 'delete') {
      await this.redoDelete(operation, sheet)
    } else if (operation.type === 'insert') {
      await this.redoInsert(operation, sheet)
    } else if (operation.type === 'edit') {
      await this.redoEdit(operation, sheet)
    } else if (operation.type === 'reorderColumn') {
      await this.redoReorderColumn(operation, sheet)
    } else if (operation.type === 'duplicateColumn') {
      await this.redoDuplicateColumn(operation, sheet)
    } else if (operation.type === 'deleteColumn') {
      await this.redoDeleteColumn(operation, sheet)
    }
  }

  // ============================================================================
  // UNDO OPERATIONS
  // ============================================================================

  /**
   * Undo a card move operation
   */
  private async undoMove(operation: UndoOperation, sheet: SheetConnection): Promise<void> {
    // Save to redo stack
    this.state.redoStack.push(operation)

    // Map operation row/col to time/lane based on current orientation
    const orientation = this.getOrientation()
    const toTime = orientation === 'vertical' ? operation.toRow : operation.toCol
    const toLane = orientation === 'vertical' ? operation.toCol : operation.toRow
    const fromTime = orientation === 'vertical' ? operation.fromRow : operation.fromCol
    const fromLane = orientation === 'vertical' ? operation.fromCol : operation.fromRow

    // Step 1: Remove card from target position
    const toKey = this.strategy.cellKey(toTime!, toLane!)
    const card = sheet.cells.get(toKey)

    if (!card) {
      console.log('[UndoRedoOperations.undoMove] Card not found at target position')
      return
    }

    sheet.cells.delete(toKey)
    console.log('[UndoRedoOperations.undoMove] Removed card from:', toKey)

    // Step 2: Get all time points and find positions
    const allTimes = this.getTimeline()
    const fromTimeIndex = allTimes.indexOf(fromTime!)
    const toTimeIndex = allTimes.indexOf(toTime!)

    // Step 3: Shift cards in target lane forward in time to fill the gap (reverse of step 4 in move)
    for (let i = toTimeIndex + 1; i < allTimes.length; i++) {
      const currentKey = this.strategy.cellKey(allTimes[i], toLane!)
      const prevKey = this.strategy.cellKey(allTimes[i - 1], toLane!)
      const shiftCard = sheet.cells.get(currentKey)
      if (shiftCard) {
        sheet.cells.delete(currentKey)
        sheet.cells.set(prevKey, shiftCard)
      }
    }

    // Step 4: Shift cards in source lane backward in time from original position (reverse of step 3 in move)
    for (let i = allTimes.length - 1; i > fromTimeIndex; i--) {
      const prevKey = this.strategy.cellKey(allTimes[i - 1], fromLane!)
      const currentKey = this.strategy.cellKey(allTimes[i], fromLane!)
      const shiftCard = sheet.cells.get(prevKey)
      if (shiftCard && i < allTimes.length) {
        sheet.cells.delete(prevKey)
        sheet.cells.set(currentKey, shiftCard)
      }
    }

    // Step 5: Place card back at original position
    const fromKey = this.strategy.cellKey(fromTime!, fromLane!)
    sheet.cells.set(fromKey, card)
    console.log('[UndoRedoOperations.undoMove] Restored card to original position:', fromKey)
  }

  /**
   * Undo a card delete operation
   */
  private async undoDelete(operation: UndoOperation, sheet: SheetConnection): Promise<void> {
    // Save current state (empty cell) to redo stack
    this.state.redoStack.push(operation)

    // Map operation row/col to time/lane based on current orientation
    const orientation = this.getOrientation()
    const deleteTime = orientation === 'vertical' ? operation.rowId : operation.colId
    const deleteLane = orientation === 'vertical' ? operation.colId : operation.rowId

    // Shift cards forward in time in this lane to make room (reverse of delete shift-up)
    const allTimes = this.getTimeline()
    const restoredTimeIndex = allTimes.indexOf(deleteTime!)

    // Shift all cards from the restored position forward in time (in reverse order)
    for (let i = allTimes.length - 1; i > restoredTimeIndex; i--) {
      const prevKey = this.strategy.cellKey(allTimes[i - 1], deleteLane!)
      const currentKey = this.strategy.cellKey(allTimes[i], deleteLane!)
      const card = sheet.cells.get(prevKey)

      if (card) {
        // Move card from earlier time to later time (forward in time)
        sheet.cells.delete(prevKey)
        sheet.cells.set(currentKey, card)
      }
    }

    // Re-add the card to the cell
    const key = this.strategy.cellKey(deleteTime!, deleteLane!)
    sheet.cells.set(key, { cardId: operation.cardId! })
    console.log('[UndoRedoOperations.undoDelete] Restored card to', key, 'and shifted lane forward in time')
  }

  /**
   * Undo a card insert operation
   */
  private async undoInsert(operation: UndoOperation, sheet: SheetConnection): Promise<void> {
    // Save to redo stack
    this.state.redoStack.push(operation)

    // Map operation row/col to time/lane based on current orientation
    const orientation = this.getOrientation()
    const insertTime = orientation === 'vertical' ? operation.rowId : operation.colId
    const insertLane = orientation === 'vertical' ? operation.colId : operation.rowId

    // Delete the card from the cell
    const key = this.strategy.cellKey(insertTime!, insertLane!)
    sheet.cells.delete(key)

    // Shift cards backward in time in this lane to fill the gap
    const allTimes = this.getTimeline()
    const deletedTimeIndex = allTimes.indexOf(insertTime!)

    // Shift all cards after the deleted card backward in time (to earlier times)
    for (let i = deletedTimeIndex + 1; i < allTimes.length; i++) {
      const currentKey = this.strategy.cellKey(allTimes[i], insertLane!)
      const prevKey = this.strategy.cellKey(allTimes[i - 1], insertLane!)
      const card = sheet.cells.get(currentKey)

      if (card) {
        // Move card from later time to earlier time (backward in time)
        sheet.cells.delete(currentKey)
        sheet.cells.set(prevKey, card)
      }
    }

    console.log('[UndoRedoOperations.undoInsert] Deleted inserted card from', key, 'and shifted lane backward in time')
  }

  /**
   * Undo a card edit operation
   */
  private async undoEdit(operation: UndoOperation, sheet: SheetConnection): Promise<void> {
    if (!operation.previousState) return

    // Get current state before undoing
    const cardsMetadata = this.getCardsMetadata()
    const currentCard = cardsMetadata.get(operation.previousState.cardId)

    // Restore previous card state via API
    try {
      const response = await fetch(`${this.apiUrl}/api/cards/${operation.previousState.cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: operation.previousState.title,
          color: operation.previousState.color,
          prompt: operation.previousState.prompt
        })
      })

      if (response.ok) {
        const restoredCard = await response.json()
        sheet.cardsMetadata.set(operation.previousState.cardId, restoredCard)
        console.log('[UndoRedoOperations.undoEdit] Restored card edit:', operation.previousState.cardId)

        // Save current state to redo stack
        if (currentCard) {
          this.state.redoStack.push({
            type: 'edit',
            userId: this.userId,
            previousState: {
              cardId: currentCard.cardId,
              title: currentCard.title,
              color: currentCard.color,
              prompt: currentCard.prompt || ''
            }
          })
        }
      } else {
        console.error('[UndoRedoOperations.undoEdit] Failed to restore card:', response.statusText)
      }
    } catch (error) {
      console.error('[UndoRedoOperations.undoEdit] Error restoring card:', error)
    }
  }

  /**
   * Undo a lane reorder operation
   */
  private async undoReorderColumn(operation: UndoOperation, sheet: SheetConnection): Promise<void> {
    this.state.redoStack.push(operation)

    const orientation = this.getOrientation()
    const laneOrder = orientation === 'vertical' ? sheet.colOrder : sheet.rowOrder
    const lanesArray = laneOrder.toArray()
    const [movedLane] = lanesArray.splice(operation.toIndex!, 1)
    lanesArray.splice(operation.fromIndex!, 0, movedLane)

    laneOrder.delete(0, laneOrder.length)
    laneOrder.push(lanesArray)

    console.log('[UndoRedoOperations.undoReorderColumn] Restored lane order', operation.colId, 'from', operation.toIndex, 'to', operation.fromIndex)
  }

  /**
   * Undo a lane duplication operation
   */
  private async undoDuplicateColumn(operation: UndoOperation, sheet: SheetConnection): Promise<void> {
    this.state.redoStack.push(operation)

    const orientation = this.getOrientation()
    const laneOrder = orientation === 'vertical' ? sheet.colOrder : sheet.rowOrder
    const lanesArray = laneOrder.toArray()
    const laneIndex = lanesArray.indexOf(operation.colId!)

    if (laneIndex !== -1) {
      // Delete the lane from laneOrder
      lanesArray.splice(laneIndex, 1)
      laneOrder.delete(0, laneOrder.length)
      laneOrder.push(lanesArray)

      // Delete all cells in this lane
      const timeline = this.getTimeline()
      timeline.forEach(timeId => {
        const key = this.strategy.cellKey(timeId, operation.colId!)
        sheet.cells.delete(key)
      })

      console.log('[UndoRedoOperations.undoDuplicateColumn] Deleted duplicated lane', operation.colId)
    }
  }

  /**
   * Undo a lane deletion operation
   */
  private async undoDeleteColumn(operation: UndoOperation, sheet: SheetConnection): Promise<void> {
    this.state.redoStack.push(operation)

    // Restore the lane to laneOrder
    const orientation = this.getOrientation()
    const laneOrder = orientation === 'vertical' ? sheet.colOrder : sheet.rowOrder
    const lanesArray = laneOrder.toArray()
    lanesArray.splice(operation.columnIndex!, 0, operation.colId!)
    laneOrder.delete(0, laneOrder.length)
    laneOrder.push(lanesArray)

    // Restore all cells in the lane (cell keys are already correctly formatted)
    if (operation.columnCells) {
      operation.columnCells.forEach((cell, key) => {
        sheet.cells.set(key, { ...cell })
      })
    }

    console.log('[UndoRedoOperations.undoDeleteColumn] Restored deleted lane', operation.colId)
  }

  // ============================================================================
  // REDO OPERATIONS
  // ============================================================================

  /**
   * Redo a card move operation
   */
  private async redoMove(operation: UndoOperation, sheet: SheetConnection): Promise<void> {
    // Save to undo stack
    this.state.undoStack.push(operation)

    // Map row/col to time/lane based on orientation
    const orientation = this.getOrientation()
    const fromTime = orientation === 'vertical' ? operation.fromRow : operation.fromCol
    const fromLane = orientation === 'vertical' ? operation.fromCol : operation.fromRow
    const toTime = orientation === 'vertical' ? operation.toRow : operation.toCol
    const toLane = orientation === 'vertical' ? operation.toCol : operation.toRow

    // Step 1: Remove card from source position
    const fromKey = this.strategy.cellKey(fromTime!, fromLane!)
    const card = sheet.cells.get(fromKey)

    if (!card) {
      console.log('[UndoRedoOperations.redoMove] Card not found at source position')
      return
    }

    sheet.cells.delete(fromKey)
    console.log('[UndoRedoOperations.redoMove] Removed card from:', fromKey)

    // Step 2: Get all times and find positions
    const allTimes = this.getTimeline()
    const fromTimeIndex = allTimes.indexOf(fromTime!)
    const toTimeIndex = allTimes.indexOf(toTime!)

    // Step 3: Shift cards in source lane UP to fill the gap
    for (let i = fromTimeIndex + 1; i < allTimes.length; i++) {
      const currentKey = this.strategy.cellKey(allTimes[i], fromLane!)
      const prevKey = this.strategy.cellKey(allTimes[i - 1], fromLane!)
      const shiftCard = sheet.cells.get(currentKey)
      if (shiftCard) {
        sheet.cells.delete(currentKey)
        sheet.cells.set(prevKey, shiftCard)
      }
    }

    // Step 4: Shift cards in target lane DOWN to make room
    for (let i = allTimes.length - 1; i > toTimeIndex; i--) {
      const prevKey = this.strategy.cellKey(allTimes[i - 1], toLane!)
      const currentKey = this.strategy.cellKey(allTimes[i], toLane!)
      const shiftCard = sheet.cells.get(prevKey)
      if (shiftCard && i < allTimes.length) {
        sheet.cells.delete(prevKey)
        sheet.cells.set(currentKey, shiftCard)
      }
    }

    // Step 5: Place card at target position
    const toKey = this.strategy.cellKey(toTime!, toLane!)
    sheet.cells.set(toKey, card)
    console.log('[UndoRedoOperations.redoMove] Re-moved card to:', toKey)
  }

  /**
   * Redo a card delete operation
   */
  private async redoDelete(operation: UndoOperation, sheet: SheetConnection): Promise<void> {
    // Save to undo stack
    this.state.undoStack.push(operation)

    // Map row/col to time/lane based on orientation
    const orientation = this.getOrientation()
    const time = orientation === 'vertical' ? operation.rowId : operation.colId
    const lane = orientation === 'vertical' ? operation.colId : operation.rowId

    // Remove the card from the cell
    const key = this.strategy.cellKey(time!, lane!)
    sheet.cells.delete(key)

    // Shift cards up in this lane to fill the gap (same as handleDeleteCard)
    const allTimes = this.getTimeline()
    const deletedTimeIndex = allTimes.indexOf(time!)

    // Shift all cards below the deleted card up by one time position
    for (let i = deletedTimeIndex + 1; i < allTimes.length; i++) {
      const currentKey = this.strategy.cellKey(allTimes[i], lane!)
      const prevKey = this.strategy.cellKey(allTimes[i - 1], lane!)
      const card = sheet.cells.get(currentKey)

      if (card) {
        // Move card from current time to previous time
        sheet.cells.delete(currentKey)
        sheet.cells.set(prevKey, card)
      }
    }

    console.log('[UndoRedoOperations.redoDelete] Re-deleted card from', key, 'and shifted lane up')
  }

  /**
   * Redo a card insert operation
   */
  private async redoInsert(operation: UndoOperation, sheet: SheetConnection): Promise<void> {
    // Save to undo stack
    this.state.undoStack.push(operation)

    // Map row/col to time/lane based on orientation
    const orientation = this.getOrientation()
    const time = orientation === 'vertical' ? operation.rowId : operation.colId
    const lane = orientation === 'vertical' ? operation.colId : operation.rowId

    // Shift cards down in this lane to make room (reverse of undo insert)
    const allTimes = this.getTimeline()
    const restoredTimeIndex = allTimes.indexOf(time!)

    // Shift all cards from the restored position down by one time position (in reverse order)
    for (let i = allTimes.length - 1; i > restoredTimeIndex; i--) {
      const prevKey = this.strategy.cellKey(allTimes[i - 1], lane!)
      const currentKey = this.strategy.cellKey(allTimes[i], lane!)
      const card = sheet.cells.get(prevKey)

      if (card) {
        // Move card from previous time to current time
        sheet.cells.delete(prevKey)
        sheet.cells.set(currentKey, card)
      }
    }

    // Re-add the card to the cell
    const key = this.strategy.cellKey(time!, lane!)
    sheet.cells.set(key, { cardId: operation.cardId! })
    console.log('[UndoRedoOperations.redoInsert] Re-inserted card to', key, 'and shifted lane down')
  }

  /**
   * Redo a card edit operation
   */
  private async redoEdit(operation: UndoOperation, sheet: SheetConnection): Promise<void> {
    if (!operation.previousState) return

    // Get current state before redoing
    const cardsMetadata = this.getCardsMetadata()
    const currentCard = cardsMetadata.get(operation.previousState.cardId)

    // Apply the "redo" state via API
    try {
      const response = await fetch(`${this.apiUrl}/api/cards/${operation.previousState.cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: operation.previousState.title,
          color: operation.previousState.color,
          prompt: operation.previousState.prompt
        })
      })

      if (response.ok) {
        const updatedCard = await response.json()
        sheet.cardsMetadata.set(operation.previousState.cardId, updatedCard)
        console.log('[UndoRedoOperations.redoEdit] Reapplied card edit:', operation.previousState.cardId)

        // Save current state to undo stack
        if (currentCard) {
          this.state.undoStack.push({
            type: 'edit',
            userId: this.userId,
            previousState: {
              cardId: currentCard.cardId,
              title: currentCard.title,
              color: currentCard.color,
              prompt: currentCard.prompt || ''
            }
          })
        }
      } else {
        console.error('[UndoRedoOperations.redoEdit] Failed to reapply card:', response.statusText)
      }
    } catch (error) {
      console.error('[UndoRedoOperations.redoEdit] Error reapplying card:', error)
    }
  }

  /**
   * Redo a lane reorder operation
   */
  private async redoReorderColumn(operation: UndoOperation, sheet: SheetConnection): Promise<void> {
    this.state.undoStack.push(operation)

    const orientation = this.getOrientation()
    const laneOrder = orientation === 'vertical' ? sheet.colOrder : sheet.rowOrder
    const lanesArray = laneOrder.toArray()
    const [movedLane] = lanesArray.splice(operation.fromIndex!, 1)
    lanesArray.splice(operation.toIndex!, 0, movedLane)

    laneOrder.delete(0, laneOrder.length)
    laneOrder.push(lanesArray)

    console.log('[UndoRedoOperations.redoReorderColumn] Re-reordered lane', operation.colId, 'from', operation.fromIndex, 'to', operation.toIndex)
  }

  /**
   * Redo a lane duplication operation
   */
  private async redoDuplicateColumn(operation: UndoOperation, sheet: SheetConnection): Promise<void> {
    this.state.undoStack.push(operation)

    // Re-add the lane
    const orientation = this.getOrientation()
    const laneOrder = orientation === 'vertical' ? sheet.colOrder : sheet.rowOrder
    const lanesArray = laneOrder.toArray()
    const sourceIndex = lanesArray.indexOf(operation.sourceColId!)

    if (sourceIndex !== -1) {
      lanesArray.splice(sourceIndex + 1, 0, operation.colId!)
      laneOrder.delete(0, laneOrder.length)
      laneOrder.push(lanesArray)

      // Re-copy all cells from source lane
      const timeline = this.getTimeline()
      timeline.forEach(timeId => {
        const sourceKey = this.strategy.cellKey(timeId, operation.sourceColId!)
        const cell = sheet.cells.get(sourceKey)
        if (cell) {
          const newKey = this.strategy.cellKey(timeId, operation.colId!)
          sheet.cells.set(newKey, { ...cell })
        }
      })

      console.log('[UndoRedoOperations.redoDuplicateColumn] Re-duplicated lane', operation.sourceColId, 'to', operation.colId)
    }
  }

  /**
   * Redo a lane deletion operation
   */
  private async redoDeleteColumn(operation: UndoOperation, sheet: SheetConnection): Promise<void> {
    this.state.undoStack.push(operation)

    const orientation = this.getOrientation()
    const laneOrder = orientation === 'vertical' ? sheet.colOrder : sheet.rowOrder
    const lanesArray = laneOrder.toArray()
    const laneIndex = lanesArray.indexOf(operation.colId!)

    if (laneIndex !== -1) {
      // Delete the lane from laneOrder
      lanesArray.splice(laneIndex, 1)
      laneOrder.delete(0, laneOrder.length)
      laneOrder.push(lanesArray)

      // Delete all cells in the lane
      const timeline = this.getTimeline()
      timeline.forEach(timeId => {
        const key = this.strategy.cellKey(timeId, operation.colId!)
        sheet.cells.delete(key)
      })

      console.log('[UndoRedoOperations.redoDeleteColumn] Re-deleted lane', operation.colId)
    }
  }
}
