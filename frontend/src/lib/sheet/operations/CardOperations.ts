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
import { setCardField, getCard } from '../../ySheet'

/**
 * Callbacks for card operations
 */
export interface CardOperationCallbacks {
  /**
   * Show a confirmation dialog
   */
  showConfirm: (message: string, onConfirm: () => void) => void

  /**
   * Show a toast notification
   */
  showToast: (message: string) => void

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

  /**
   * Delete an entire column (called when deleting from phantom row)
   */
  onDeleteColumn?: (colId: string) => void
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
          if (this.callbacks.onDeleteColumn) {
            this.callbacks.onDeleteColumn(colId)
          } else {
            console.error('[CardOperations.handleDeleteCard] onDeleteColumn callback not provided')
          }
        }
      )
    } else {
      // Check if deleting this card will cause the lane to be empty
      const cellsMap = this.getCellsMap()
      const key = this.strategy.cellKey(time, lane)
      const cell = cellsMap.get(key)

      // Count cards in this lane BEFORE deletion
      const cardsInLaneBefore = timeline.filter(t => {
        const k = this.strategy.cellKey(t, lane)
        return cellsMap.get(k) !== undefined
      }).length

      // If this is the last card, save entire lane for restoration
      if (cardsInLaneBefore === 1 && cell && cell.cardId) {
        const laneOrder = orientation === 'vertical' ? sheet.colOrder : sheet.rowOrder
        const lanes = laneOrder.toArray()
        const laneIndex = lanes.indexOf(lane)

        // Save as deleteColumn operation to restore lane position
        this.callbacks.onRecordUndo({
          type: 'deleteColumn',
          userId: this.userId,
          rowId,
          colId,
          cardId: cell.cardId,
          columnIndex: laneIndex,
          columnCells: new Map([[key, { cardId: cell.cardId }]])
        })
        this.callbacks.onClearRedo()
        console.log('[CardOperations.handleDeleteCard] Saved lane deletion to undo stack')
      } else if (cell && cell.cardId) {
        // Normal card deletion
        this.callbacks.onRecordUndo({
          type: 'delete',
          userId: this.userId,
          rowId,
          colId,
          cardId: cell.cardId
        })
        this.callbacks.onClearRedo()
        console.log('[CardOperations.handleDeleteCard] Saved card deletion to undo stack')
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

      // Check if the lane is now empty (no cards at all, including header)
      const laneHasCards = allTimes.some(t => {
        const key = this.strategy.cellKey(t, lane)
        return sheet.cells.get(key) !== undefined
      })

      if (!laneHasCards) {
        // Lane is empty, remove it and compact remaining lanes (shift left)
        console.log('[CardOperations.handleDeleteCard] Lane is empty, removing:', lane)

        // Get current lane order (colOrder in vertical mode, rowOrder in horizontal)
        const laneOrder = orientation === 'vertical' ? sheet.colOrder : sheet.rowOrder
        const lanes = laneOrder.toArray()
        const laneIndex = lanes.indexOf(lane)

        if (laneIndex !== -1) {
          // Remove the empty lane from the order (this shifts remaining lanes left automatically)
          laneOrder.delete(laneIndex, 1)
          console.log('[CardOperations.handleDeleteCard] Removed empty lane at index:', laneIndex)
        }
      }
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

    // Update Yjs immediately for real-time sync (granular update - only title field)
    const sheet = this.getSheet()
    if (sheet) {
      setCardField(sheet, cardId, 'title', newTitle)
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
        // Yjs already updated via handleCardTitleInput, no need to update again
        // Backend is now in sync
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

  /**
   * Set cover image for a lane
   *
   * Takes the thumbnail (or color if no thumbnail) from the specified card
   * and applies it to the frozen header card for that lane. If the card has
   * no thumbnail, copies its color and clears any existing media.
   *
   * This operation is undo-able.
   *
   * @param cardId - ID of the card whose thumbnail/color to use
   */
  async handleSetCoverImage(cardId: string): Promise<void> {
    const sheet = this.getSheet()
    if (!sheet) return

    const cardsMetadata = this.getCardsMetadata()
    const card = cardsMetadata.get(cardId)
    if (!card) {
      this.callbacks.showToast('Card not found')
      return
    }

    // Find which lane this card is in
    const orientation = this.getOrientation()
    const cellsMap = this.getCellsMap()

    for (const [cellKey, cell] of cellsMap.entries()) {
      if (cell.cardId === cardId) {
        const [rowId, colId] = cellKey.split(':')
        const laneId = orientation === 'vertical' ? colId : rowId

        // Find the frozen header card for this lane
        const timeline = this.getTimeline()
        const frozenTime = timeline[0]
        const frozenKey = orientation === 'vertical'
          ? `${frozenTime}:${laneId}`
          : `${laneId}:${frozenTime}`

        const frozenCell = cellsMap.get(frozenKey)
        if (frozenCell && frozenCell.cardId) {
          const frozenCardId = frozenCell.cardId
          const frozenCard = cardsMetadata.get(frozenCardId)
          if (frozenCard) {
            // Save previous state for undo (including media fields)
            this.callbacks.onRecordUndo({
              type: 'edit',
              userId: this.userId,
              previousState: {
                cardId: frozenCardId,
                title: frozenCard.title,
                color: frozenCard.color,
                prompt: frozenCard.prompt || '',
                thumb_url: frozenCard.thumb_url,
                media_url: frozenCard.media_url,
                media_type: frozenCard.media_type
              }
            })
            this.callbacks.onClearRedo()

            // Prepare update based on whether card has thumbnail or just color
            let ysjUpdate: Record<string, any>
            let backendUpdate: any

            console.log('[CardOperations.handleSetCoverImage] Source card:', card)
            console.log('[CardOperations.handleSetCoverImage] Has thumb_url:', !!card.thumb_url)

            if (card.thumb_url) {
              // Card has thumbnail - copy media fields
              ysjUpdate = {
                thumb_url: card.thumb_url,
                media_url: card.media_url,
                media_type: card.media_type,
                color: card.color
              }
              backendUpdate = {
                thumb_url: card.thumb_url,
                media_url: card.media_url,
                media_type: card.media_type,
                color: card.color
              }
            } else {
              // Card has no thumbnail - copy color and clear media fields
              ysjUpdate = {
                color: card.color,
                thumb_url: null,
                media_url: null,
                media_type: null
              }
              backendUpdate = {
                color: card.color,
                thumb_url: null,
                media_url: null,
                media_type: null
              }
            }

            // Update only the changed fields in Yjs
            console.log('[CardOperations.handleSetCoverImage] Frozen card ID:', frozenCardId)
            console.log('[CardOperations.handleSetCoverImage] Yjs updates:', ysjUpdate)

            const cardMap = sheet.cardsMetadata.get(frozenCardId)
            console.log('[CardOperations.handleSetCoverImage] Card map exists:', !!cardMap)

            if (cardMap) {
              // Use a transaction to batch all updates together
              sheet.doc.transact(() => {
                for (const [key, value] of Object.entries(ysjUpdate)) {
                  if (value === null) {
                    // Delete the field if value is null (only if it exists)
                    if (cardMap.has(key)) {
                      console.log(`[CardOperations.handleSetCoverImage] Deleting field ${key}`)
                      cardMap.delete(key)
                    }
                  } else {
                    // Set the field if value is not null
                    console.log(`[CardOperations.handleSetCoverImage] Setting field ${key} to`, value)
                    cardMap.set(key, value)
                  }
                }
              })

              // Verify the update
              console.log('[CardOperations.handleSetCoverImage] After update - color:', cardMap.get('color'))
              console.log('[CardOperations.handleSetCoverImage] After update - thumb_url:', cardMap.get('thumb_url'))
            }

            // Update backend
            try {
              console.log('[CardOperations.handleSetCoverImage] Sending to backend:', backendUpdate)

              const response = await fetch(`${this.apiUrl}/api/cards/${frozenCardId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(backendUpdate)
              })

              if (response.ok) {
                console.log('[CardOperations.handleSetCoverImage] Backend update successful')
              } else {
                const errorText = await response.text()
                console.error('[CardOperations.handleSetCoverImage] Backend error:', response.status, errorText)
                this.callbacks.showToast('Failed to update cover')
              }
            } catch (error) {
              console.error('[CardOperations.handleSetCoverImage] Error:', error)
              this.callbacks.showToast('Failed to update cover')
            }
          }
        }
        break
      }
    }
  }

  /**
   * Download card media and JSON metadata
   *
   * Downloads both the media file (if exists) and a JSON file containing
   * the card's metadata.
   *
   * @param cardId - ID of the card to download
   */
  async handleDownloadCard(cardId: string): Promise<void> {
    const cardsMetadata = this.getCardsMetadata()
    const card = cardsMetadata.get(cardId)
    if (!card) return

    const cardName = card.title || 'card'

    // Download media if it exists
    if (card.media_url) {
      try {
        const response = await fetch(card.media_url)
        const blob = await response.blob()
        const extension = card.media_type === 'video' ? 'mp4' : 'png'
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${cardName}.${extension}`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } catch (error) {
        console.error('[CardOperations.handleDownloadCard] Failed to download media:', error)
      }
    }

    // Download JSON metadata
    const metadata = {
      cardId: card.cardId,
      title: card.title,
      color: card.color,
      prompt: card.prompt,
      number: card.number,
      media_url: card.media_url,
      thumb_url: card.thumb_url,
      media_type: card.media_type
    }
    const jsonBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' })
    const jsonUrl = window.URL.createObjectURL(jsonBlob)
    const jsonLink = document.createElement('a')
    jsonLink.href = jsonUrl
    jsonLink.download = `${cardName}.json`
    document.body.appendChild(jsonLink)
    jsonLink.click()
    window.URL.revokeObjectURL(jsonUrl)
    document.body.removeChild(jsonLink)

    this.callbacks.showToast('Card downloaded')
  }
}
