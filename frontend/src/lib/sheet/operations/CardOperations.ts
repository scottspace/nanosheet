/**
 * CardOperations - Handles basic card CRUD operations
 *
 * This class encapsulates all logic for managing individual cards including:
 * - Deleting cards (with Kanban-style shifting)
 * - Editing card titles (with debounced API calls)
 * - Opening cards in a modal for detailed editing
 * - Real-time card updates via Yjs
 */

import type { OrientationStrategy } from '../strategies/orientation/OrientationStrategy'
import type { SheetConnection } from '../../ySheet'

/**
 * Callbacks for card operations
 */
export interface CardOperationCallbacks {
  /**
   * Show a confirmation dialog
   */
  showConfirm: (message: string, onConfirm: () => void) => void

  /**
   * Record an undo operation
   */
  onRecordUndo: (operation: {
    type: 'delete' | 'edit'
    userId: string
    rowId?: string
    colId?: string
    cardId?: string
    previousState?: {
      cardId: string
      title: string
      color: string
      prompt: string
    }
  }) => void

  /**
   * Clear the redo stack after a new operation
   */
  onClearRedo: () => void
}

/**
 * Modal state container
 */
export interface CardModalState {
  showModal: boolean
  modalCardId: string | null
  modalMediaId: string | null
  modalTitle: string
  modalColor: string
  modalPrompt: string
  modalMediaUrl: string | null
  modalMediaType: string | null
  modalThumbUrl: string | null
  attachments: any[]
}

/**
 * CardOperations class manages card CRUD operations
 */
export class CardOperations {
  private strategy: OrientationStrategy
  private modalState: CardModalState
  private callbacks: CardOperationCallbacks
  private userId: string
  private apiUrl: string
  private getSheet: () => SheetConnection | null
  private getTimeline: () => string[]
  private getCellsMap: () => Map<string, { cardId: string }>
  private getCardsMetadata: () => Map<string, any>
  private getOrientation: () => 'vertical' | 'horizontal'

  // Debounce tracking for card title updates
  private cardTitleDebounceTimers: Map<string, number> = new Map()
  private cardTitlePreviousValues: Map<string, string> = new Map()

  /**
   * Constructor
   *
   * @param strategy - Orientation strategy for coordinate mapping
   * @param modalState - Reactive modal state object (will be mutated)
   * @param callbacks - Callbacks for confirmations and undo tracking
   * @param userId - Current user ID for undo tracking
   * @param apiUrl - API URL for card updates
   * @param getSheet - Function that returns current SheetConnection
   * @param getTimeline - Function that returns current timeline array
   * @param getCellsMap - Function that returns current cells map
   * @param getCardsMetadata - Function that returns current cards metadata
   * @param getOrientation - Function that returns current orientation
   */
  constructor(
    strategy: OrientationStrategy,
    modalState: CardModalState,
    callbacks: CardOperationCallbacks,
    userId: string,
    apiUrl: string,
    getSheet: () => SheetConnection | null,
    getTimeline: () => string[],
    getCellsMap: () => Map<string, { cardId: string }>,
    getCardsMetadata: () => Map<string, any>,
    getOrientation: () => 'vertical' | 'horizontal'
  ) {
    this.strategy = strategy
    this.modalState = modalState
    this.callbacks = callbacks
    this.userId = userId
    this.apiUrl = apiUrl
    this.getSheet = getSheet
    this.getTimeline = getTimeline
    this.getCellsMap = getCellsMap
    this.getCardsMetadata = getCardsMetadata
    this.getOrientation = getOrientation
  }

  /**
   * Delete a card
   *
   * Deletes a card from the sheet and shifts all cards below it up by one position
   * to fill the gap (Kanban-style). If deleting from the first time position (frozen
   * header), prompts to delete the entire lane instead.
   *
   * @param rowId - Row ID of the card
   * @param colId - Column ID of the card
   */
  handleDeleteCard(rowId: string, colId: string): void {
    const sheet = this.getSheet()
    if (!sheet) return

    // Map row/col IDs to semantic time/lane based on orientation
    const orientation = this.getOrientation()
    const time = orientation === 'vertical' ? rowId : colId
    const lane = orientation === 'vertical' ? colId : rowId

    // Check if this is the first time position (frozen header) - deleting it deletes the whole lane
    const timeline = this.getTimeline()
    const isFirstTime = timeline.length > 0 && time === timeline[0]

    if (isFirstTime) {
      // Count how many cards are in this lane
      const cellsMap = this.getCellsMap()
      const cardsInLane = timeline.filter(t => {
        const key = this.strategy.cellKey(t, lane)
        const cell = cellsMap.get(key)
        return cell && cell.cardId
      }).length

      this.callbacks.showConfirm(
        `Delete this entire lane? This will delete ${cardsInLane} card${cardsInLane !== 1 ? 's' : ''} and cannot be undone.`,
        () => {
          // Note: This calls back to ColumnOperations.deleteColumn
          // The caller should handle this by passing in the deleteColumn function
          console.warn('[CardOperations.handleDeleteCard] Attempted to delete entire lane - caller should handle this')
        }
      )
    } else {
      // Save to undo stack before deleting single card
      const key = this.strategy.cellKey(time, lane)
      const cellsMap = this.getCellsMap()
      const cell = cellsMap.get(key)
      if (cell && cell.cardId) {
        this.callbacks.onRecordUndo({
          type: 'delete',
          userId: this.userId,
          rowId,
          colId,
          cardId: cell.cardId
        })
        this.callbacks.onClearRedo()
        console.log('[CardOperations.handleDeleteCard] Saved to undo stack')
      }

      // Delete the card
      sheet.cells.delete(key)

      // Shift cards up in this lane to fill the gap (Kanban style)
      const allTimes = timeline
      const deletedTimeIndex = allTimes.indexOf(time)

      // Shift all cards below the deleted card up by one time position
      for (let i = deletedTimeIndex + 1; i < allTimes.length; i++) {
        const currentKey = this.strategy.cellKey(allTimes[i], lane)
        const prevKey = this.strategy.cellKey(allTimes[i - 1], lane)
        const card = sheet.cells.get(currentKey)

        if (card) {
          // Move card from current time to previous time
          sheet.cells.delete(currentKey)
          sheet.cells.set(prevKey, card)
        }
      }

      console.log('[CardOperations.handleDeleteCard] Deleted card and shifted lane up:', time, lane)
    }
  }

  /**
   * Handle card double-click to open modal
   *
   * Opens the card modal for detailed editing, including title, color, prompt,
   * media viewing, and drawing annotations. Sets up Yjs bindings for collaborative
   * editing.
   *
   * @param cardId - ID of the card to open
   */
  handleCardDoubleClick(cardId: string): void {
    const cardsMetadata = this.getCardsMetadata()
    const card = cardsMetadata.get(cardId)
    this.modalState.modalCardId = cardId

    // Set the media ID - for now, default media for the card
    // In the future, this could be a specific attachment ID
    this.modalState.modalMediaId = `${cardId}_default`

    this.modalState.modalTitle = card?.title || ''
    this.modalState.modalColor = card?.color || '#CCCCCC'
    this.modalState.modalPrompt = card?.prompt || ''
    this.modalState.modalMediaUrl = card?.media_url || null  // Display the full media in modal
    this.modalState.modalMediaType = card?.media_type || null  // "image" or "video"
    this.modalState.modalThumbUrl = card?.thumb_url || null  // Thumbnail for video poster
    this.modalState.attachments = card?.attachments || []

    // Note: Yjs binding setup should be handled by the caller after modal is shown
    // The caller needs to handle:
    // 1. Setting up promptYText = sheet.doc.getText(`prompt_${cardId}`)
    // 2. Loading drawings from sheet.doc.getMap(`drawings_${modalMediaId}`)
    // 3. Binding textarea to Yjs after DOM is ready

    this.modalState.showModal = true

    console.log('[CardOperations.handleCardDoubleClick] Opened modal for card:', cardId)
  }

  /**
   * Handle card title input (real-time updates)
   *
   * Updates the card title in Yjs immediately for real-time sync across clients,
   * and debounces the API call to the backend to save the title after 500ms of
   * no typing.
   *
   * @param cardId - ID of the card being edited
   * @param newTitle - New title value
   */
  handleCardTitleInput(cardId: string, newTitle: string): void {
    const cardsMetadata = this.getCardsMetadata()
    const currentCard = cardsMetadata.get(cardId)
    if (!currentCard) return

    // Save original value for undo (only on first edit)
    if (!this.cardTitlePreviousValues.has(cardId)) {
      this.cardTitlePreviousValues.set(cardId, currentCard.title)
    }

    // Update Yjs immediately for real-time sync
    const sheet = this.getSheet()
    if (sheet) {
      const updatedCard = { ...currentCard, title: newTitle }
      sheet.cardsMetadata.set(cardId, updatedCard)
    }

    // Debounce API call to backend (save after 500ms of no typing)
    const existingTimer = this.cardTitleDebounceTimers.get(cardId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    const timer = setTimeout(async () => {
      await this.saveCardTitleToBackend(cardId, newTitle)
      this.cardTitleDebounceTimers.delete(cardId)
    }, 500) as unknown as number

    this.cardTitleDebounceTimers.set(cardId, timer)
  }

  /**
   * Handle card title change (blur or Enter)
   *
   * Cancels any pending debounce timer and saves the title immediately.
   *
   * @param cardId - ID of the card being edited
   * @param newTitle - New title value
   */
  async handleCardTitleChange(cardId: string, newTitle: string): Promise<void> {
    // Cancel debounce and save immediately
    const existingTimer = this.cardTitleDebounceTimers.get(cardId)
    if (existingTimer) {
      clearTimeout(existingTimer)
      this.cardTitleDebounceTimers.delete(cardId)
    }

    await this.saveCardTitleToBackend(cardId, newTitle)
  }

  /**
   * Save card title to backend and add to undo stack
   *
   * Persists the card title to the backend API and records an undo operation
   * for the title change.
   *
   * @param cardId - ID of the card being edited
   * @param newTitle - New title value
   */
  private async saveCardTitleToBackend(cardId: string, newTitle: string): Promise<void> {
    const previousValue = this.cardTitlePreviousValues.get(cardId)
    const cardsMetadata = this.getCardsMetadata()
    const currentCard = cardsMetadata.get(cardId)
    if (!currentCard) return

    // Don't update if title hasn't changed from original
    if (previousValue && previousValue === newTitle) {
      this.cardTitlePreviousValues.delete(cardId)
      return
    }

    console.log('[CardOperations.saveCardTitleToBackend] Saving card title:', cardId, newTitle)

    // Store previous state for undo
    if (previousValue) {
      this.callbacks.onRecordUndo({
        type: 'edit',
        userId: this.userId,
        previousState: {
          cardId: cardId,
          title: previousValue,
          color: currentCard.color,
          prompt: currentCard.prompt || ''
        }
      })
      this.callbacks.onClearRedo()
      this.cardTitlePreviousValues.delete(cardId)
      console.log('[CardOperations.saveCardTitleToBackend] Saved to undo stack')
    }

    try {
      // Update card metadata via API
      const response = await fetch(`${this.apiUrl}/api/cards/${cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          color: currentCard.color,
          prompt: currentCard.prompt || ''
        })
      })

      if (response.ok) {
        // Update Yjs with backend response (ensures consistency)
        const updatedCard = await response.json()
        const sheet = this.getSheet()
        if (sheet) {
          sheet.cardsMetadata.set(cardId, updatedCard)
        }
        console.log('[CardOperations.saveCardTitleToBackend] Card title updated successfully')
      } else {
        console.error('[CardOperations.saveCardTitleToBackend] Failed to update card:', response.statusText)
        // Note: Caller might want to handle rolling back the undo entry
      }
    } catch (error) {
      console.error('[CardOperations.saveCardTitleToBackend] Error updating card:', error)
      // Note: Caller might want to handle rolling back the undo entry
    }
  }
}
