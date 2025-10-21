<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import type { SheetConnection } from '../lib/ySheet'
  import {
    connectSheet,
    addRow,
    addCol,
    addCard,
    moveCard,
    deleteCard,
    insertCard,
    deleteRow,
    copyRow,
    copyCol,
    getAllCardIds
  } from '../lib/ySheet'

  const WS_URL = import.meta.env.VITE_YWS || 'ws://localhost:8000/yjs'
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  const SHEET_ID = 'test-sheet-1'  // Persistent sheet for testing

  // Generate a unique user ID for this session
  const USER_ID = `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

  let sheet: SheetConnection | null = null
  let rows: string[] = $state([])
  let cols: string[] = $state([])
  let cellsMap: Map<string, { cardId: string }> = $state(new Map())
  let cardsMetadata: Map<string, any> = $state(new Map())
  let shotTitles: Map<string, string> = $state(new Map())
  let loading = $state(true)
  let draggedCard: { rowId: string; colId: string; cardId: string } | null = null
  let dragPreview: { targetCol: string; targetRow: string; insertBefore: boolean } | null = $state(null)
  let isDragging = $state(false)
  let dragMousePos = $state({ x: 0, y: 0 })
  let showModal = $state(false)
  let modalCardId = $state<string | null>(null)
  let modalPrompt = $state('')
  let modalTitle = $state('')
  let modalColor = $state('#CCCCCC')

  // Canvas drawing state
  let canvasRef: HTMLCanvasElement | null = null
  let isDrawing = $state(false)
  let currentColor = $state('white')
  let drawingStrokes: any[] = $state([])

  // Per-card drawing undo/redo stacks
  let drawingHistory: Map<string, any[][]> = new Map()
  let drawingRedoStack: Map<string, any[][]> = new Map()

  // Thumbnail sizes (8 presets in exact 16:9 aspect ratio)
  const THUMBNAIL_SIZES = [
    { label: '160 × 90', width: 160, height: 90 },      // 160/9*16 = 90
    { label: '192 × 108', width: 192, height: 108 },    // 192/9*16 = 108
    { label: '224 × 126', width: 224, height: 126 },    // 224/9*16 = 126
    { label: '256 × 144', width: 256, height: 144 },    // 256/9*16 = 144
    { label: '288 × 162', width: 288, height: 162 },    // 288/9*16 = 162
    { label: '320 × 180', width: 320, height: 180 },    // 320/9*16 = 180
    { label: '384 × 216', width: 384, height: 216 },    // 384/9*16 = 216
    { label: '448 × 252', width: 448, height: 252 },    // 448/9*16 = 252
  ]

  // Load settings from localStorage or use defaults
  const loadedThumbnailSize = typeof localStorage !== 'undefined'
    ? parseInt(localStorage.getItem('thumbnailSize') || '3', 10)
    : 3
  const loadedMuteState = typeof localStorage !== 'undefined'
    ? localStorage.getItem('isSoundMuted') === 'true'
    : false

  let selectedThumbnailSize = $state(loadedThumbnailSize)
  let showThumbnailMenu = $state(false)
  let isSoundMuted = $state(loadedMuteState)
  let openEllipsisMenu: string | null = $state(null) // Track which column's menu is open

  // Undo stack - stores operations that can be undone
  interface UndoOperation {
    type: 'delete' | 'edit' | 'move'
    userId: string  // Track which user performed this operation
    // For delete operations
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
  }
  let undoStack: UndoOperation[] = $state([])
  let redoStack: UndoOperation[] = $state([])

  // API helpers
  async function fetchCards(cardIds: string[]): Promise<any[]> {
    if (cardIds.length === 0) return []
    const response = await fetch(`${API_URL}/api/cards/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardIds })
    })
    if (!response.ok) throw new Error('Failed to fetch cards')
    return response.json()
  }

  // Call backend API to regenerate the sheet with 8 columns, 3-20 cards each
  async function regenerateSheet() {
    console.log('[regenerateSheet] Calling backend API to generate 8 columns with 3-20 cards each...')
    const response = await fetch(`${API_URL}/api/sheets/${SHEET_ID}/regenerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        num_cols: 8
        // cards_per_col will be randomized 3-20 per column by backend
      })
    })
    if (!response.ok) {
      throw new Error('Failed to regenerate sheet')
    }
    const result = await response.json()
    console.log('[regenerateSheet] Result:', result)
    return result
  }

  // Debounce timer for fetching cards
  let fetchCardsTimeout: number | null = null

  // Update local state from Yjs
  function updateFromYjs(event?: any) {
    if (!sheet) return

    const eventType = event ? `with event (${event.constructor.name})` : 'manually'
    console.log(`[updateFromYjs] called ${eventType}`)

    rows = sheet.rowOrder.toArray()
    cols = sheet.colOrder.toArray()

    const newCellsMap = new Map()
    sheet.cells.forEach((value, key) => {
      newCellsMap.set(key, value)
    })
    cellsMap = newCellsMap

    // Get shot titles from Yjs
    const shotTitlesMap = sheet.doc.getMap('shotTitles')
    const newShotTitles = new Map()
    shotTitlesMap.forEach((value, key) => {
      newShotTitles.set(key, value)
    })
    shotTitles = newShotTitles

    // Get cards metadata from Yjs
    const newCardsMetadata = new Map()
    sheet.cardsMetadata.forEach((value, key) => {
      newCardsMetadata.set(key, value)
    })
    cardsMetadata = newCardsMetadata

    console.log(`[updateFromYjs] Updated: ${rows.length} rows, ${cols.length} cols, ${cellsMap.size} cells, ${shotTitles.size} shot titles, ${cardsMetadata.size} cards`)
    console.log(`[updateFromYjs] Provider synced: ${sheet.provider.synced}, WS connected: ${sheet.provider.wsconnected}`)

    // Debounce card fetching to avoid redundant requests (for cards not yet in Yjs)
    if (fetchCardsTimeout) {
      clearTimeout(fetchCardsTimeout)
    }

    fetchCardsTimeout = setTimeout(() => {
      const cardIds = getAllCardIds(sheet)

      // Only fetch cards we don't already have in Yjs
      const missingCardIds = cardIds.filter(id => !cardsMetadata.has(id))

      if (missingCardIds.length > 0) {
        fetchCards(missingCardIds).then(cards => {
          cards.forEach(card => {
            // Store in Yjs so it syncs to other clients
            sheet.cardsMetadata.set(card.cardId, card)
          })
        })
      }
    }, 100) as unknown as number
  }

  // Regenerate all cards in the sheet
  async function handleRegenerate() {
    console.log('[handleRegenerate] Starting...')

    // Clear local card metadata cache
    cardsMetadata = new Map()

    // Call backend API to regenerate
    await regenerateSheet()

    console.log('[handleRegenerate] Complete - Yjs will sync the new data')
  }

  // Handlers
  function handleAddRow() {
    if (!sheet) return
    addRow(sheet)
  }

  function handleAddColumn() {
    if (!sheet) return
    addCol(sheet)
  }

  function handleCopyRow(rowId: string) {
    if (!sheet) return
    copyRow(sheet, rowId)
  }

  function handleCopyColumn(colId: string) {
    if (!sheet) return
    copyCol(sheet, colId)
  }

  function handleDeleteCard(rowId: string, colId: string) {
    if (!sheet) return

    // Save to undo stack before deleting
    const cellKey = `${rowId}:${colId}`
    const cell = cellsMap.get(cellKey)
    if (cell && cell.cardId) {
      undoStack.push({
        type: 'delete',
        userId: USER_ID,
        rowId,
        colId,
        cardId: cell.cardId
      })
      // Clear redo stack on new action
      redoStack = []
      console.log('[handleDeleteCard] Saved to undo stack:', undoStack.length)
    }

    deleteCard(sheet, rowId, colId)
  }

  // Undo the last operation by the current user
  async function handleUndo() {
    if (undoStack.length === 0) {
      console.log('[handleUndo] Nothing to undo')
      return
    }

    // Find the last operation by the current user
    let operationIndex = -1
    for (let i = undoStack.length - 1; i >= 0; i--) {
      if (undoStack[i].userId === USER_ID) {
        operationIndex = i
        break
      }
    }

    if (operationIndex === -1) {
      console.log('[handleUndo] No operations by current user to undo')
      return
    }

    // Remove the operation from the stack
    const operation = undoStack.splice(operationIndex, 1)[0]
    console.log('[handleUndo] Undoing operation:', operation)

    if (operation.type === 'move' && sheet) {
      // Undo a card move: restore to original position and delete the new row
      // Save to redo stack
      redoStack.push(operation)

      // Get the card from the new position
      const newCellKey = `${operation.toRow}:${operation.toCol}`
      const card = sheet.cells.get(newCellKey)

      if (card) {
        // Restore card to original position
        const originalCellKey = `${operation.fromRow}:${operation.fromCol}`
        sheet.cells.set(originalCellKey, card)
        console.log('[handleUndo] Restored card to original position:', originalCellKey)
      }

      // Delete the new row that was created for the move
      deleteRow(sheet, operation.toRow)
      console.log('[handleUndo] Deleted row:', operation.toRow)
    } else if (operation.type === 'delete' && sheet) {
      // Save current state (empty cell) to redo stack
      redoStack.push(operation)

      // Re-add the card to the cell
      const cellKey = `${operation.rowId}:${operation.colId}`
      sheet.cells.set(cellKey, { cardId: operation.cardId })
      console.log('[handleUndo] Restored card to', cellKey)
    } else if (operation.type === 'edit' && operation.previousState) {
      // Get current state before undoing
      const currentCard = cardsMetadata.get(operation.previousState.cardId)

      // Restore previous card state via API
      try {
        const response = await fetch(`${API_URL}/api/cards/${operation.previousState.cardId}`, {
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
          if (sheet) {
            sheet.cardsMetadata.set(operation.previousState.cardId, restoredCard)
          }
          console.log('[handleUndo] Restored card edit:', operation.previousState.cardId)

          // Save current state to redo stack
          if (currentCard) {
            redoStack.push({
              type: 'edit',
              userId: USER_ID,
              previousState: {
                cardId: currentCard.cardId,
                title: currentCard.title,
                color: currentCard.color,
                prompt: currentCard.prompt || ''
              }
            })
          }
        } else {
          console.error('[handleUndo] Failed to restore card:', response.statusText)
        }
      } catch (error) {
        console.error('[handleUndo] Error restoring card:', error)
      }
    }
  }

  // Redo the last undone operation by the current user
  async function handleRedo() {
    if (redoStack.length === 0) {
      console.log('[handleRedo] Nothing to redo')
      return
    }

    // Find the last operation by the current user
    let operationIndex = -1
    for (let i = redoStack.length - 1; i >= 0; i--) {
      if (redoStack[i].userId === USER_ID) {
        operationIndex = i
        break
      }
    }

    if (operationIndex === -1) {
      console.log('[handleRedo] No operations by current user to redo')
      return
    }

    // Remove the operation from the stack
    const operation = redoStack.splice(operationIndex, 1)[0]
    console.log('[handleRedo] Redoing operation:', operation)

    if (operation.type === 'move' && sheet) {
      // Redo a card move: remove from original position and recreate in new position
      // Save to undo stack
      undoStack.push(operation)

      // Get the card from the original position
      const originalCellKey = `${operation.fromRow}:${operation.fromCol}`
      const card = sheet.cells.get(originalCellKey)

      if (card) {
        // Remove from original position
        sheet.cells.delete(originalCellKey)

        // Recreate the row and place card in new position
        const rows = sheet.rowOrder.toArray()
        const targetIndex = rows.indexOf(operation.toRow)

        if (targetIndex === -1) {
          // Row doesn't exist, recreate it at the end (shouldn't happen normally)
          sheet.rowOrder.push([operation.toRow])
        }

        // Place card in the new position
        const newCellKey = `${operation.toRow}:${operation.toCol}`
        sheet.cells.set(newCellKey, card)
        console.log('[handleRedo] Re-moved card to:', newCellKey)
      }
    } else if (operation.type === 'delete' && sheet) {
      // Save to undo stack
      undoStack.push(operation)

      // Remove the card from the cell
      const cellKey = `${operation.rowId}:${operation.colId}`
      deleteCard(sheet, operation.rowId, operation.colId)
      console.log('[handleRedo] Re-deleted card from', cellKey)
    } else if (operation.type === 'edit' && operation.previousState) {
      // Get current state before redoing
      const currentCard = cardsMetadata.get(operation.previousState.cardId)

      // Apply the "redo" state via API
      try {
        const response = await fetch(`${API_URL}/api/cards/${operation.previousState.cardId}`, {
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
          if (sheet) {
            sheet.cardsMetadata.set(operation.previousState.cardId, updatedCard)
          }
          console.log('[handleRedo] Reapplied card edit:', operation.previousState.cardId)

          // Save current state to undo stack
          if (currentCard) {
            undoStack.push({
              type: 'edit',
              userId: USER_ID,
              previousState: {
                cardId: currentCard.cardId,
                title: currentCard.title,
                color: currentCard.color,
                prompt: currentCard.prompt || ''
              }
            })
          }
        } else {
          console.error('[handleRedo] Failed to reapply card:', response.statusText)
        }
      } catch (error) {
        console.error('[handleRedo] Error reapplying card:', error)
      }
    }
  }

  // Drag & Drop handlers with visual preview
  function handleDragStart(event: DragEvent, rowId: string, colId: string, cardId: string) {
    // Skip frozen row (first row)
    if (rows.length > 0 && rowId === rows[0]) {
      event.preventDefault()
      return
    }

    draggedCard = { rowId, colId, cardId }
    isDragging = true
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', cardId)
    }
    console.log('[handleDragStart] Started dragging:', cardId)
  }

  function handleDragOver(event: DragEvent, targetRow: string, targetCol: string, cardElement: HTMLElement) {
    event.preventDefault()
    if (!draggedCard || !isDragging) return

    // Skip frozen row as drop target
    if (rows.length > 0 && targetRow === rows[0]) {
      dragPreview = null
      return
    }

    // Don't show preview if it's the same cell
    if (draggedCard.rowId === targetRow && draggedCard.colId === targetCol) {
      dragPreview = null
      return
    }

    // Track mouse position
    dragMousePos = { x: event.clientX, y: event.clientY }

    // Calculate if mouse is in top or bottom half of card
    const rect = cardElement.getBoundingClientRect()
    const mouseY = event.clientY
    const cardMidpoint = rect.top + (rect.height / 2)
    const insertBefore = mouseY < cardMidpoint

    // Update preview
    dragPreview = {
      targetCol,
      targetRow,
      insertBefore
    }

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
  }

  function handleDragEnd(event: DragEvent) {
    console.log('[handleDragEnd] Drag ended')
    isDragging = false
    dragPreview = null
    draggedCard = null
  }

  function handleDrop(event: DragEvent, toRow: string, toCol: string) {
    event.preventDefault()
    if (!sheet || !draggedCard || !dragPreview) {
      isDragging = false
      dragPreview = null
      draggedCard = null
      return
    }

    const { rowId: fromRow, colId: fromCol, cardId } = draggedCard
    const { targetRow, targetCol, insertBefore } = dragPreview

    console.log('[handleDrop] Dropping card:', { fromRow, fromCol, targetRow, targetCol, insertBefore })

    // Insert the card (creates new row, doesn't replace)
    const newRowId = insertCard(sheet, fromRow, fromCol, targetRow, targetCol, insertBefore)

    if (newRowId) {
      // Save to undo stack with both old and new positions
      undoStack.push({
        type: 'move',
        userId: USER_ID,
        cardId: cardId,
        fromRow: fromRow,
        fromCol: fromCol,
        toRow: newRowId,
        toCol: targetCol
      })
      redoStack = []
    }

    // Clear drag state
    isDragging = false
    dragPreview = null
    draggedCard = null
  }

  // Keyboard event handler for undo and cancel drag
  function handleKeydown(event: KeyboardEvent) {
    // Escape cancels drag
    if (event.key === 'Escape' && isDragging) {
      event.preventDefault()
      console.log('[handleKeydown] Canceling drag with Escape')
      isDragging = false
      dragPreview = null
      draggedCard = null
      return
    }

    // Check for Cmd+Z (Mac) or Ctrl+Z (Windows/Linux)
    if ((event.metaKey || event.ctrlKey) && event.key === 'z') {
      event.preventDefault()
      handleUndo()
    }
  }

  // Toggle thumbnail size menu
  function toggleThumbnailMenu() {
    showThumbnailMenu = !showThumbnailMenu
    console.log('[toggleThumbnailMenu] Menu is now:', showThumbnailMenu ? 'open' : 'closed')
  }

  // Select a thumbnail size
  function selectThumbnailSize(index: number) {
    selectedThumbnailSize = index
    showThumbnailMenu = false
    // Save to localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('thumbnailSize', index.toString())
    }
    console.log('[selectThumbnailSize] Selected size:', THUMBNAIL_SIZES[index].label)
  }

  // Toggle sound mute/unmute
  function toggleSound() {
    isSoundMuted = !isSoundMuted
    // Save to localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('isSoundMuted', isSoundMuted.toString())
    }
    console.log('[toggleSound] Sound is now:', isSoundMuted ? 'muted' : 'unmuted')
  }

  // Toggle ellipsis menu for a column
  function toggleEllipsisMenu(colId: string) {
    const wasOpen = openEllipsisMenu === colId
    openEllipsisMenu = wasOpen ? null : colId
    console.log('[toggleEllipsisMenu] Menu for column:', colId, 'is now:', openEllipsisMenu ? 'open' : 'closed')
    console.log('[toggleEllipsisMenu] openEllipsisMenu value:', openEllipsisMenu)
  }

  // Handle ellipsis menu actions
  function handleMenuAction(colId: string, action: string) {
    console.log('[handleMenuAction] Column:', colId, 'Action:', action)
    openEllipsisMenu = null
    // Add your action handlers here
    alert(`${action} for column ${colId}`)
  }

  // Close thumbnail menu when clicking outside
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement

    if (showThumbnailMenu && !target.closest('.thumbnail-dropdown')) {
      showThumbnailMenu = false
    }

    // Only close ellipsis menu if clicking outside the container
    if (openEllipsisMenu) {
      const ellipsisContainer = target.closest('.ellipsis-menu-container')
      if (!ellipsisContainer) {
        console.log('[handleClickOutside] Closing ellipsis menu')
        openEllipsisMenu = null
      }
    }
  }

  // Update shot title in Yjs (syncs in real-time)
  function handleShotTitleChange(shotId: string, title: string) {
    if (!sheet) return

    const shotTitlesMap = sheet.doc.getMap('shotTitles')
    shotTitlesMap.set(shotId, title)
    console.log('[handleShotTitleChange] Updated shot title in Yjs:', shotId, title)
  }

  // Debounce timers for card title updates
  let cardTitleDebounceTimers: Map<string, number> = new Map()
  let cardTitlePreviousValues: Map<string, string> = new Map()

  // Update card title in real-time (Yjs only, debounced API)
  function handleCardTitleInput(cardId: string, newTitle: string) {
    const currentCard = cardsMetadata.get(cardId)
    if (!currentCard) return

    // Save original value for undo (only on first edit)
    if (!cardTitlePreviousValues.has(cardId)) {
      cardTitlePreviousValues.set(cardId, currentCard.title)
    }

    // Update Yjs immediately for real-time sync
    if (sheet) {
      const updatedCard = { ...currentCard, title: newTitle }
      sheet.cardsMetadata.set(cardId, updatedCard)
    }

    // Debounce API call to backend (save after 500ms of no typing)
    const existingTimer = cardTitleDebounceTimers.get(cardId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    const timer = setTimeout(async () => {
      await saveCardTitleToBackend(cardId, newTitle)
      cardTitleDebounceTimers.delete(cardId)
    }, 500) as unknown as number

    cardTitleDebounceTimers.set(cardId, timer)
  }

  // Handle when user finishes editing (blur or Enter)
  async function handleCardTitleChange(cardId: string, newTitle: string) {
    // Cancel debounce and save immediately
    const existingTimer = cardTitleDebounceTimers.get(cardId)
    if (existingTimer) {
      clearTimeout(existingTimer)
      cardTitleDebounceTimers.delete(cardId)
    }

    await saveCardTitleToBackend(cardId, newTitle)
  }

  // Save card title to backend and add to undo stack
  async function saveCardTitleToBackend(cardId: string, newTitle: string) {
    const previousValue = cardTitlePreviousValues.get(cardId)
    const currentCard = cardsMetadata.get(cardId)
    if (!currentCard) return

    // Don't update if title hasn't changed from original
    if (previousValue && previousValue === newTitle) {
      cardTitlePreviousValues.delete(cardId)
      return
    }

    console.log('[saveCardTitleToBackend] Saving card title:', cardId, newTitle)

    // Store previous state for undo
    if (previousValue) {
      undoStack.push({
        type: 'edit',
        userId: USER_ID,
        previousState: {
          cardId: cardId,
          title: previousValue,
          color: currentCard.color,
          prompt: currentCard.prompt || ''
        }
      })
      // Clear redo stack on new action
      redoStack = []
      cardTitlePreviousValues.delete(cardId)
      console.log('[saveCardTitleToBackend] Saved to undo stack:', undoStack.length, 'operations')
    }

    try {
      // Update card metadata via API
      const response = await fetch(`${API_URL}/api/cards/${cardId}`, {
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
        if (sheet) {
          sheet.cardsMetadata.set(cardId, updatedCard)
        }
        console.log('[saveCardTitleToBackend] Card title updated successfully')
      } else {
        console.error('[saveCardTitleToBackend] Failed to update card:', response.statusText)
        // Remove the undo entry if the update failed
        if (previousValue) {
          undoStack.pop()
        }
      }
    } catch (error) {
      console.error('[saveCardTitleToBackend] Error updating card:', error)
      // Remove the undo entry if the update failed
      if (previousValue) {
        undoStack.pop()
      }
    }
  }

  // Open modal on double-click
  function handleCardDoubleClick(cardId: string) {
    const card = cardsMetadata.get(cardId)
    modalCardId = cardId
    modalTitle = card?.title || ''
    modalColor = card?.color || '#CCCCCC'
    modalPrompt = card?.prompt || ''

    // Load existing drawings if any
    if (sheet) {
      const cardDrawings = sheet.doc.getMap(`drawings_${cardId}`)
      const strokesData = cardDrawings.get('strokes')
      if (strokesData) {
        try {
          drawingStrokes = JSON.parse(strokesData as string)
        } catch (e) {
          drawingStrokes = []
        }
      } else {
        drawingStrokes = []
      }

      // Observe drawing changes from other users
      cardDrawings.observe(() => {
        const updatedStrokes = cardDrawings.get('strokes')
        if (updatedStrokes) {
          try {
            drawingStrokes = JSON.parse(updatedStrokes as string)
            redrawCanvas()
          } catch (e) {
            console.error('Error parsing drawing strokes:', e)
          }
        }
      })
    }

    showModal = true

    // Initialize canvas after modal is shown
    setTimeout(() => {
      if (canvasRef) {
        initCanvas(canvasRef)
      }
    }, 100)
  }

  // Close modal
  function closeModal() {
    showModal = false
    modalCardId = null
    modalPrompt = ''
    modalTitle = ''
    modalColor = '#CCCCCC'
  }

  // Save modal changes
  async function saveModal() {
    if (!modalCardId) return

    console.log('[saveModal] Saving changes for card:', modalCardId)
    console.log('[saveModal] Title:', modalTitle, 'Color:', modalColor, 'Prompt:', modalPrompt)

    // Store previous state for undo
    const previousCard = cardsMetadata.get(modalCardId)
    if (previousCard) {
      undoStack.push({
        type: 'edit',
        userId: USER_ID,
        previousState: {
          cardId: modalCardId,
          title: previousCard.title,
          color: previousCard.color,
          prompt: previousCard.prompt || ''
        }
      })
      // Clear redo stack on new action
      redoStack = []
      console.log('[saveModal] Saved to undo stack:', undoStack.length, 'operations')
    }

    try {
      // Update card metadata via API
      const response = await fetch(`${API_URL}/api/cards/${modalCardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: modalTitle,
          color: modalColor,
          prompt: modalPrompt
        })
      })

      if (response.ok) {
        // Update Yjs so it syncs to all clients
        const updatedCard = await response.json()
        if (sheet) {
          sheet.cardsMetadata.set(modalCardId, updatedCard)
        }
        console.log('[saveModal] Card updated successfully')
      } else {
        console.error('[saveModal] Failed to update card:', response.statusText)
      }
    } catch (error) {
      console.error('[saveModal] Error updating card:', error)
    }

    closeModal()
  }

  // Canvas drawing functions
  function initCanvas(canvas: HTMLCanvasElement) {
    canvasRef = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size to match its display size
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = rect.height

    // Redraw existing strokes
    redrawCanvas()
  }

  function startDrawing(e: MouseEvent) {
    if (!canvasRef) return
    isDrawing = true
    const rect = canvasRef.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Start new stroke
    const newStroke = {
      color: currentColor,
      points: [{ x, y }]
    }
    drawingStrokes = [...drawingStrokes, newStroke]

    // Sync to Yjs
    if (sheet && modalCardId) {
      const cardDrawings = sheet.doc.getMap(`drawings_${modalCardId}`)
      cardDrawings.set('strokes', JSON.stringify(drawingStrokes))
    }
  }

  function draw(e: MouseEvent) {
    if (!isDrawing || !canvasRef) return

    const rect = canvasRef.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Add point to current stroke
    const currentStroke = drawingStrokes[drawingStrokes.length - 1]
    if (currentStroke) {
      currentStroke.points.push({ x, y })
      drawingStrokes = [...drawingStrokes]

      // Draw the line segment
      const ctx = canvasRef.getContext('2d')
      if (ctx) {
        const prevPoint = currentStroke.points[currentStroke.points.length - 2]
        ctx.strokeStyle = currentColor
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(prevPoint.x, prevPoint.y)
        ctx.lineTo(x, y)
        ctx.stroke()
      }

      // Sync to Yjs
      if (sheet && modalCardId) {
        const cardDrawings = sheet.doc.getMap(`drawings_${modalCardId}`)
        cardDrawings.set('strokes', JSON.stringify(drawingStrokes))
      }
    }
  }

  function stopDrawing() {
    if (isDrawing && modalCardId) {
      // Save current state to history when stroke is complete
      const history = drawingHistory.get(modalCardId) || []
      history.push(JSON.parse(JSON.stringify(drawingStrokes)))
      drawingHistory.set(modalCardId, history)

      // Clear redo stack on new stroke
      drawingRedoStack.set(modalCardId, [])
    }
    isDrawing = false
  }

  function undoStroke() {
    if (!modalCardId) return

    const history = drawingHistory.get(modalCardId) || []
    if (history.length === 0) return

    // Pop the last state from history
    const previousState = history.pop()
    drawingHistory.set(modalCardId, history)

    // Save current state to redo stack
    const redoStack = drawingRedoStack.get(modalCardId) || []
    redoStack.push(JSON.parse(JSON.stringify(drawingStrokes)))
    drawingRedoStack.set(modalCardId, redoStack)

    // Restore previous state
    if (previousState) {
      drawingStrokes = previousState
      redrawCanvas()

      // Sync to Yjs
      if (sheet) {
        const cardDrawings = sheet.doc.getMap(`drawings_${modalCardId}`)
        cardDrawings.set('strokes', JSON.stringify(drawingStrokes))
      }
    }
  }

  function redoStroke() {
    if (!modalCardId) return

    const redoStack = drawingRedoStack.get(modalCardId) || []
    if (redoStack.length === 0) return

    // Pop from redo stack
    const nextState = redoStack.pop()
    drawingRedoStack.set(modalCardId, redoStack)

    // Save current state to history
    const history = drawingHistory.get(modalCardId) || []
    history.push(JSON.parse(JSON.stringify(drawingStrokes)))
    drawingHistory.set(modalCardId, history)

    // Restore next state
    if (nextState) {
      drawingStrokes = nextState
      redrawCanvas()

      // Sync to Yjs
      if (sheet) {
        const cardDrawings = sheet.doc.getMap(`drawings_${modalCardId}`)
        cardDrawings.set('strokes', JSON.stringify(drawingStrokes))
      }
    }
  }

  function clearCanvas() {
    drawingStrokes = []
    if (canvasRef) {
      const ctx = canvasRef.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.width, canvasRef.height)
      }
    }

    // Sync to Yjs
    if (sheet && modalCardId) {
      const cardDrawings = sheet.doc.getMap(`drawings_${modalCardId}`)
      cardDrawings.set('strokes', JSON.stringify([]))
    }
  }

  function redrawCanvas() {
    if (!canvasRef) return
    const ctx = canvasRef.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvasRef.width, canvasRef.height)

    // Draw all strokes
    drawingStrokes.forEach(stroke => {
      if (stroke.points.length < 2) return

      ctx.strokeStyle = stroke.color
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y)

      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
      }
      ctx.stroke()
    })
  }

  function setDrawColor(color: string) {
    currentColor = color
  }

  // Handle modal title input with real-time sync
  function handleModalTitleInput(value: string) {
    modalTitle = value
    if (sheet && modalCardId) {
      const cardMetadata = sheet.cardsMetadata.get(modalCardId)
      if (cardMetadata) {
        sheet.cardsMetadata.set(modalCardId, { ...cardMetadata, title: value })
      }
    }
  }

  // Mount/unmount
  onMount(async () => {
    console.log('Connecting to WebSocket:', WS_URL, 'Sheet ID:', SHEET_ID)

    // Add keyboard event listener
    window.addEventListener('keydown', handleKeydown)

    // Add click listener for closing dropdown
    window.addEventListener('click', handleClickOutside)

    try {
      sheet = connectSheet(WS_URL, SHEET_ID)

      console.log('Sheet connected:', sheet)

      // Observe changes
      sheet.rowOrder.observe((event) => {
        console.log('[rowOrder observer] Change detected')
        updateFromYjs(event)
      })
      sheet.colOrder.observe((event) => {
        console.log('[colOrder observer] Change detected')
        updateFromYjs(event)
      })
      sheet.cells.observe((event) => {
        console.log('[cells observer] Change detected')
        updateFromYjs(event)
      })

      // Observe shot titles
      const shotTitlesMap = sheet.doc.getMap('shotTitles')
      shotTitlesMap.observe((event) => {
        console.log('[shotTitles observer] Change detected')
        updateFromYjs(event)
      })

      // Observe cards metadata
      sheet.cardsMetadata.observe((event) => {
        console.log('[cardsMetadata observer] Change detected')
        updateFromYjs(event)
      })

      // Listen for connection status
      sheet.provider.on('status', (event: any) => {
        console.log('[WebSocket] Status:', event.status)
      })

      // Listen for when provider connects/disconnects
      sheet.provider.on('connection-close', (event: any) => {
        console.log('[WebSocket] Connection closed:', event)
      })

      sheet.provider.on('connection-error', (event: any) => {
        console.error('[WebSocket] Connection error:', event)
      })

      // Wait for initial sync
      sheet.provider.on('sync', async (synced: boolean) => {
        console.log('[sync event] Synced:', synced)
        if (synced) {
          // Wait a bit to let initial data propagate from other clients
          await new Promise(resolve => setTimeout(resolve, 200))

          updateFromYjs()

          console.log(`[sync event] Sheet has ${sheet.rowOrder.length} rows, ${sheet.colOrder.length} cols, ${sheet.cells.size} cells`)

          loading = false
        }
      })

      // Fallback timeout check (in case sync event doesn't fire)
      setTimeout(async () => {
        console.log('[fallback timeout] Checking initial state')
        console.log(`[fallback timeout] Provider synced: ${sheet.provider.synced}`)
        console.log(`[fallback timeout] Yjs state: rowOrder=${sheet.rowOrder.length}, colOrder=${sheet.colOrder.length}, cells=${sheet.cells.size}`)

        updateFromYjs()
        loading = false
      }, 2000)

    } catch (error) {
      console.error('Error connecting to sheet:', error)
      loading = false
    }
  })

  onDestroy(() => {
    // Remove keyboard event listener
    window.removeEventListener('keydown', handleKeydown)
    window.removeEventListener('click', handleClickOutside)

    if (sheet) {
      sheet.provider.destroy()
      sheet.doc.destroy()
    }
  })
</script>

<div class="app-container">
  <!-- Top Toolbar -->
  <div class="toolbar">
    <div class="toolbar-left">
      <span class="app-title">Storyboard</span>

      <div class="toolbar-divider"></div>

      <button class="icon-btn" title="Undo" onclick={handleUndo}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M8 4L4 8L8 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M4 8H14C15.1046 8 16 8.89543 16 10V12C16 13.1046 15.1046 14 14 14H10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button class="icon-btn" title="Redo" onclick={handleRedo}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M12 4L16 8L12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M16 8H6C4.89543 8 4 8.89543 4 10V12C4 13.1046 4.89543 14 6 14H10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>

    <div class="toolbar-right">
      <button class="btn-toolbar">Archive</button>

      <div class="thumbnail-dropdown">
        <button class="btn-size-display" onclick={(e) => { e.stopPropagation(); toggleThumbnailMenu(); }}>
          {THUMBNAIL_SIZES[selectedThumbnailSize].label}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="margin-left: 4px;">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        {#if showThumbnailMenu}
          <div class="thumbnail-menu">
            {#each THUMBNAIL_SIZES as size, index}
              <button
                class="thumbnail-menu-item"
                class:selected={selectedThumbnailSize === index}
                onclick={() => selectThumbnailSize(index)}
              >
                {size.label}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <button class="icon-btn" title={isSoundMuted ? "Unmute" : "Mute"} onclick={toggleSound}>
        {#if isSoundMuted}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 4L6 8H3V12H6L10 16V4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M13 8L17 12M17 8L13 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        {:else}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 4L6 8H3V12H6L10 16V4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M14 7C14.6 8 15 9.5 15 10C15 10.5 14.6 12 14 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        {/if}
      </button>

      <!-- Ellipsis menu -->
      <div class="ellipsis-menu-container">
        <button class="icon-btn" title="More options" onclick={() => toggleEllipsisMenu('toolbar')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="4" r="1.5" fill="currentColor"/>
            <circle cx="10" cy="10" r="1.5" fill="currentColor"/>
            <circle cx="10" cy="16" r="1.5" fill="currentColor"/>
          </svg>
        </button>

        {#if openEllipsisMenu === 'toolbar'}
          <div class="ellipsis-menu">
            <button
              class="ellipsis-menu-item"
              onclick={() => handleMenuAction('toolbar', 'Cure Cancer')}
            >
              Cure Cancer
            </button>
            <button
              class="ellipsis-menu-item"
              onclick={() => handleMenuAction('toolbar', 'World Peace')}
            >
              World Peace
            </button>
            <button
              class="ellipsis-menu-item"
              onclick={() => handleMenuAction('toolbar', 'More Cowbell')}
            >
              More Cowbell
            </button>
          </div>
        {/if}
      </div>

      <button class="icon-btn" onclick={handleRegenerate} title="Regenerate (Dev)">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C12.7614 3 15.1355 4.63 16.2686 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M17 4V7H14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <div class="profile-badge">
        <div class="profile-info">
          <span class="plan-name">ULTRA</span>
          <div class="profile-pic">SP</div>
        </div>
      </div>
    </div>
  </div>

  <div class="main-layout">
    <!-- Left Sidebar -->
    <aside class="sidebar">
      <div class="project-name">
        <input type="text" value="Mystic Lake" class="project-name-input" title="Mystic Lake" />
      </div>

      <nav class="nav-sheets">
        <button class="nav-item">Film (0)</button>
        <button class="nav-item">Blocks (0)</button>
        <button class="nav-item">Scenes (0)</button>
        <button class="nav-item active">Shots (3)</button>
        <button class="nav-item">Images (7)</button>
      </nav>
    </aside>

    <!-- Main Content Area -->
    <main class="content">

  {#if loading}
    <div class="loading">Loading shots...</div>
  {:else}
    <div class="sheet-view">
      <!-- Frozen header row with shot titles -->
      <div class="frozen-row" style="gap: {THUMBNAIL_SIZES[selectedThumbnailSize].width * 0.05}px">
        {#each cols as colId (colId)}
          <div class="shot-column" style="min-width: {THUMBNAIL_SIZES[selectedThumbnailSize].width}px">
            <!-- Title and icons on same line -->
            <div class="shot-header-title">
              <input
                type="text"
                class="shot-title-input"
                value={shotTitles.get(colId) || `Shot ${colId.replace('c-', '').replace('media', '1').replace('alt', '2').replace('notes', '3')}`}
                placeholder="Shot title"
                onchange={(e) => handleShotTitleChange(colId, e.currentTarget.value)}
              />
              <div class="shot-header-icons">
                <button class="icon-btn-header" title="Add comment">
                  <span class="material-symbols-outlined">comment</span>
                </button>
                <button class="icon-btn-header" title="Export">
                  <span class="material-symbols-outlined">file_download</span>
                </button>
              </div>
            </div>

            <!-- First card (frozen) -->
            {#if rows.length > 0}
              {@const firstRowId = rows[0]}
              {@const cellKey = `${firstRowId}:${colId}`}
              {@const cell = cellsMap.get(cellKey)}
              {@const cardId = cell?.cardId}
              {@const card = cardId ? cardsMetadata.get(cardId) : null}

              {#if card}
                <div
                  class="shot-card"
                  style="background-color: {card.color}; width: {THUMBNAIL_SIZES[selectedThumbnailSize].width}px; height: {THUMBNAIL_SIZES[selectedThumbnailSize].height}px"
                  draggable="true"
                  ondragstart={(e) => handleDragStart(e, firstRowId, colId, cardId)}
                  ondblclick={() => handleCardDoubleClick(cardId)}
                >
                  <input
                    type="text"
                    class="shot-title-input card-title-input"
                    value={card.title}
                    oninput={(e) => handleCardTitleInput(cardId, e.currentTarget.value)}
                    onchange={(e) => handleCardTitleChange(cardId, e.currentTarget.value)}
                    onclick={(e) => e.stopPropagation()}
                  />
                  <button
                    class="btn-delete"
                    onclick={(e) => {
                      e.stopPropagation()
                      handleDeleteCard(firstRowId, colId)
                    }}
                  >
                    ×
                  </button>
                </div>
              {/if}
            {/if}
          </div>
        {/each}
      </div>

      <!-- Scrollable columns area -->
      <div class="columns-container" style="gap: {THUMBNAIL_SIZES[selectedThumbnailSize].width * 0.05}px">
        {#each cols as colId (colId)}
          <div class="column" style="min-width: {THUMBNAIL_SIZES[selectedThumbnailSize].width}px; gap: {THUMBNAIL_SIZES[selectedThumbnailSize].width * 0.035}px">
            <!-- Get all cards in this column (skip first row) -->
            {#each rows.slice(1) as rowId (rowId)}
              {@const cellKey = `${rowId}:${colId}`}
              {@const cell = cellsMap.get(cellKey)}
              {@const cardId = cell?.cardId}
              {@const card = cardId ? cardsMetadata.get(cardId) : null}

              <!-- Show placeholder before card if drag preview indicates it -->
              {#if dragPreview && dragPreview.targetCol === colId && dragPreview.targetRow === rowId && dragPreview.insertBefore}
                <div class="drag-placeholder" style="width: {THUMBNAIL_SIZES[selectedThumbnailSize].width}px; height: {THUMBNAIL_SIZES[selectedThumbnailSize].height}px"></div>
              {/if}

              {#if card}
                <div
                  class="shot-card {isDragging && draggedCard?.cardId === cardId ? 'dragging' : ''}"
                  style="background-color: {card.color}; width: {THUMBNAIL_SIZES[selectedThumbnailSize].width}px; height: {THUMBNAIL_SIZES[selectedThumbnailSize].height}px"
                  draggable="true"
                  ondragstart={(e) => handleDragStart(e, rowId, colId, cardId)}
                  ondragover={(e) => handleDragOver(e, rowId, colId, e.currentTarget)}
                  ondrop={(e) => handleDrop(e, rowId, colId)}
                  ondragend={(e) => handleDragEnd(e)}
                  ondblclick={() => handleCardDoubleClick(cardId)}
                >
                  <input
                    type="text"
                    class="shot-title-input card-title-input"
                    value={card.title}
                    oninput={(e) => handleCardTitleInput(cardId, e.currentTarget.value)}
                    onchange={(e) => handleCardTitleChange(cardId, e.currentTarget.value)}
                    onclick={(e) => e.stopPropagation()}
                  />
                  <button
                    class="btn-delete"
                    onclick={(e) => {
                      e.stopPropagation()
                      handleDeleteCard(rowId, colId)
                    }}
                  >
                    ×
                  </button>
                </div>
              {/if}

              <!-- Show placeholder after card if drag preview indicates it -->
              {#if dragPreview && dragPreview.targetCol === colId && dragPreview.targetRow === rowId && !dragPreview.insertBefore}
                <div class="drag-placeholder" style="width: {THUMBNAIL_SIZES[selectedThumbnailSize].width}px; height: {THUMBNAIL_SIZES[selectedThumbnailSize].height}px"></div>
              {/if}
            {/each}
          </div>
        {/each}
      </div>
    </div>
  {/if}
    </main>
  </div>

  <!-- Modal Overlay -->
  {#if showModal}
    <div class="modal-overlay" onclick={closeModal}>
      <div class="modal-content-large" onclick={(e) => e.stopPropagation()}>
        <!-- Left side: Large card preview with canvas -->
        <div class="modal-left">
          <!-- Editable title above card -->
          <input
            type="text"
            class="modal-card-title"
            value={modalTitle}
            oninput={(e) => handleModalTitleInput(e.currentTarget.value)}
            placeholder="Shot title..."
          />

          <div class="modal-card-preview" style="background-color: {modalColor}">
            <canvas
              bind:this={canvasRef}
              class="sketch-canvas"
              width="800"
              height="450"
              onmousedown={startDrawing}
              onmousemove={draw}
              onmouseup={stopDrawing}
              onmouseleave={stopDrawing}
            ></canvas>
          </div>

          <!-- Sketch tools -->
          <div class="sketch-tools">
            <span class="tool-label">Draw:</span>
            <button
              class="color-circle"
              class:active={currentColor === 'white'}
              style="background: white;"
              title="White"
              onclick={() => setDrawColor('white')}
            ></button>
            <button
              class="color-circle"
              class:active={currentColor === 'black'}
              style="background: black;"
              title="Black"
              onclick={() => setDrawColor('black')}
            ></button>

            <div class="tool-divider"></div>

            <button class="tool-btn" title="Undo stroke" onclick={undoStroke}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M8 4L4 8L8 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M4 8H14C15.1046 8 16 8.89543 16 10V12C16 13.1046 15.1046 14 14 14H10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="tool-btn" title="Redo stroke" onclick={redoStroke}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M12 4L16 8L12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M16 8H6C4.89543 8 4 8.89543 4 10V12C4 13.1046 4.89543 14 6 14H10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>

            <div class="tool-divider"></div>

            <button class="tool-btn" title="Clear all" onclick={clearCanvas}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M4 6H16M8 6V4C8 3.44772 8.44772 3 9 3H11C11.5523 3 12 3.44772 12 4V6M6 6V16C6 16.5523 6.44772 17 7 17H13C13.5523 17 14 16.5523 14 16V6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Right side: Edit controls -->
        <div class="modal-right">
          <div class="modal-header">
            <h2 class="modal-section-title">Image Tools</h2>
            <button class="modal-close-btn" onclick={closeModal}>×</button>
          </div>

          <div class="modal-fields">
            <div class="modal-field">
              <label class="modal-label">Color</label>
              <div class="color-input-group">
                <input
                  type="color"
                  class="modal-color-picker"
                  bind:value={modalColor}
                />
                <input
                  type="text"
                  class="modal-input modal-color-text"
                  bind:value={modalColor}
                  placeholder="#CCCCCC"
                  pattern="^#[0-9A-Fa-f]{6}$"
                />
              </div>
            </div>

            <div class="modal-field">
              <label class="modal-label">Prompt</label>
              <textarea
                class="modal-textarea"
                bind:value={modalPrompt}
                placeholder="Add a rowing oar"
                rows="6"
              ></textarea>
            </div>
          </div>

          <div class="modal-actions">
            <button class="modal-btn modal-btn-cancel" onclick={closeModal}>
              Cancel
            </button>
            <button class="modal-btn modal-btn-save" onclick={saveModal}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #000;
    color: #e0e0e0;
    overflow: hidden;
  }

  /* Custom scrollbar styling */
  :global(*::-webkit-scrollbar) {
    width: 8px;
    height: 8px;
  }

  :global(*::-webkit-scrollbar-track) {
    background: transparent;
  }

  :global(*::-webkit-scrollbar-thumb) {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 4px;
  }

  :global(*::-webkit-scrollbar-thumb:hover) {
    background: rgba(255, 255, 255, 0.25);
  }

  /* Firefox scrollbar */
  :global(*) {
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
  }

  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #000;
  }

  /* Toolbar */
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 52px;
    padding: 0 1rem;
    background: #0a0a0a;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
  }

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .toolbar-divider {
    width: 1px;
    height: 24px;
    background: rgba(255, 255, 255, 0.1);
    margin: 0 0.25rem;
  }

  .app-title {
    font-size: 0.95rem;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
    letter-spacing: -0.01em;
  }

  .icon-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    transition: all 0.15s;
  }

  .icon-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.9);
  }

  .btn-toolbar {
    padding: 0.5rem 1rem;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-toolbar:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.9);
  }

  .btn-size-display {
    padding: 0.35rem 0.5rem;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.7rem;
    font-family: 'Monaco', 'Menlo', monospace;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    white-space: nowrap;
  }

  .btn-size-display:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.9);
  }

  .thumbnail-dropdown {
    position: relative;
  }

  .thumbnail-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 140px;
    background: #1a1a1a;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    padding: 0.25rem;
    z-index: 1000;
  }

  .thumbnail-menu-item {
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.75rem;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s;
    font-family: 'Monaco', 'Menlo', monospace;
  }

  .thumbnail-menu-item:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.95);
  }

  .thumbnail-menu-item.selected {
    background: rgba(100, 100, 255, 0.2);
    color: rgba(255, 255, 255, 0.95);
  }

  .profile-badge {
    display: flex;
    align-items: center;
    margin-left: 0.5rem;
  }

  .profile-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .profile-info:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.15);
  }

  .plan-name {
    font-size: 0.7rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.5);
    letter-spacing: 0.05em;
  }

  .profile-pic {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 0.75rem;
    font-weight: 600;
  }

  /* Main Layout */
  .main-layout {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* Sidebar */
  .sidebar {
    width: 140px;
    background: #0a0a0a;
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    padding: 0.75rem;
  }

  .project-name {
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .project-name-input {
    width: 100%;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.8rem;
    font-weight: 600;
    outline: none;
    padding: 0.3rem 0.4rem;
    border-radius: 4px;
    transition: all 0.15s;
  }

  .project-name-input:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  .project-name-input:focus {
    background: rgba(255, 255, 255, 0.06);
  }

  .icon-btn-small {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.4);
    cursor: pointer;
    transition: all 0.15s;
  }

  .icon-btn-small:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.8);
  }

  .nav-sheets {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .nav-item {
    padding: 0.5rem 0.5rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.75rem;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s;
  }

  .nav-item:hover {
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.8);
  }

  .nav-item.active {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.95);
    font-weight: 500;
  }

  /* Content Area */
  .content {
    flex: 1;
    overflow: hidden;
    background: #000;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
  }

  .btn-small {
    padding: 0.35rem 0.65rem;
    font-size: 0.75rem;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.9);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-small:hover {
    background: rgba(255, 255, 255, 0.12);
    transform: translateY(-1px);
  }

  .btn-delete {
    position: absolute;
    top: 8px;
    left: 8px;
    padding: 0;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(10px);
    color: white;
    font-size: 1.3rem;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.1);
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .shot-card:hover .btn-delete {
    opacity: 1;
  }

  .btn-delete:hover {
    background: rgba(0, 0, 0, 0.85);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .loading {
    text-align: center;
    padding: 3rem;
    color: rgba(255, 255, 255, 0.5);
    font-size: 1.1rem;
  }

  /* Sheet View */
  .sheet-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  /* Frozen Row - Shot Headers */
  .frozen-row {
    display: flex;
    gap: 1.5rem;
    padding-bottom: 2.5rem;
    border-bottom: 2px solid rgba(255, 255, 255, 0.15);
    margin-bottom: 2.5rem;
  }

  .shot-column {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .shot-header-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    gap: 0.5rem;
  }

  .shot-title-input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.95);
    font-size: clamp(0.75rem, 1.5vw, 1.1rem);
    font-weight: 400;
    outline: none;
    padding: 0.25rem 0;
    border-radius: 0;
    transition: all 0.15s;
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .shot-title-input:hover {
    color: rgba(255, 255, 255, 1);
  }

  .shot-title-input:focus {
    color: rgba(255, 255, 255, 1);
  }

  .card-title-input {
    flex: none;
    width: 50%;
    min-width: 60px;
    max-width: 200px;
    height: auto;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 20px;
    padding: 0.35rem 0.75rem;
    color: rgba(255, 255, 255, 0.95);
    font-size: clamp(0.625rem, 0.5vw + 0.5rem, 0.875rem);
    font-weight: 500;
    text-align: center;
    outline: none;
    transition: all 0.15s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-title-input:hover {
    background: rgba(0, 0, 0, 0.4);
    border-color: rgba(255, 255, 255, 0.25);
    color: rgba(255, 255, 255, 1);
  }

  .card-title-input:focus {
    background: rgba(0, 0, 0, 0.5);
    border-color: rgba(100, 100, 255, 0.6);
    color: rgba(255, 255, 255, 1);
  }

  .shot-header-icons {
    display: flex;
    gap: 0.25rem;
    flex-shrink: 0;
    align-items: center;
  }

  .icon-btn-header {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .icon-btn-header:hover {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.95);
  }

  .icon-btn-header .material-symbols-outlined {
    font-size: 20px;
  }

  .ellipsis-btn {
    font-size: 20px;
    font-weight: bold;
    line-height: 1;
  }

  /* Ellipsis menu */
  .ellipsis-menu-container {
    position: relative;
    display: flex;
  }

  .ellipsis-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 180px;
    background: #1a1a1a;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.8);
    padding: 0.5rem;
    z-index: 10000;
  }

  .ellipsis-menu-item {
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.875rem;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s;
    font-family: 'Monaco', 'Menlo', monospace;
  }

  .ellipsis-menu-item:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.95);
  }

  /* Columns Container */
  .columns-container {
    display: flex;
    gap: 1.5rem;
    overflow-x: auto;
    overflow-y: auto;
    flex: 1;
    padding-bottom: 2rem;
    padding-right: 1rem;
    min-height: 0;
  }

  .column {
    display: flex;
    flex-direction: column;
  }

  /* Shot Card (Image placeholder) */
  .shot-card {
    position: relative;
    border-radius: 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    cursor: grab;
    transition: all 0.2s ease;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-sizing: border-box;
    flex-shrink: 0;
  }

  .shot-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .shot-card:active {
    cursor: grabbing;
  }

  .shot-card.dragging {
    opacity: 0.4;
    transform: scale(0.95);
  }

  .drag-placeholder {
    background: rgba(128, 128, 128, 0.05);
    border: 2px dashed rgba(128, 128, 128, 0.3);
    border-radius: 4px;
    transition: all 0.2s ease;
  }

  .shot-title {
    color: white;
    font-weight: 500;
    font-size: 1rem;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
    text-align: center;
    letter-spacing: -0.01em;
  }

  /* Modal Styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.92);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.2s ease;
    padding: 2rem;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .modal-content-large {
    display: flex;
    gap: 1.5rem;
    background: #000;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 12px;
    max-width: 1400px;
    max-height: 90vh;
    width: 100%;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
    animation: slideUp 0.2s ease;
    overflow: hidden;
  }

  @keyframes slideUp {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .modal-left {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 1.5rem;
    min-width: 0;
  }

  .modal-card-title {
    background: transparent;
    border: none;
    color: white;
    font-size: 1.5rem;
    font-weight: 300;
    padding: 0.5rem 0 1rem 0;
    outline: none;
    text-align: left;
    letter-spacing: -0.01em;
  }

  .modal-card-title::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }

  .modal-card-title:focus {
    color: rgba(255, 255, 255, 1);
  }

  .modal-card-preview {
    flex: 1;
    border-radius: 8px;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    overflow: hidden;
  }

  .sketch-canvas {
    width: 100%;
    height: 100%;
    cursor: crosshair;
    border-radius: 8px;
  }

  .sketch-tools {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 1rem;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
  }

  .tool-label {
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.7);
    font-weight: 500;
  }

  .color-btn {
    width: 36px;
    height: 36px;
    border-radius: 6px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    background: transparent;
    cursor: pointer;
    padding: 4px;
    transition: all 0.15s;
  }

  .color-btn:hover {
    border-color: rgba(255, 255, 255, 0.4);
  }

  .color-btn.active {
    border-color: rgba(100, 150, 255, 0.8);
    box-shadow: 0 0 0 2px rgba(100, 150, 255, 0.2);
  }

  .color-swatch {
    width: 100%;
    height: 100%;
    border-radius: 3px;
    border: 1px solid rgba(0, 0, 0, 0.2);
  }

  .tool-btn {
    width: 36px;
    height: 36px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: transparent;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }

  .tool-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.95);
  }

  .color-circle {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.2);
    cursor: pointer;
    padding: 0;
    transition: all 0.15s;
  }

  .color-circle:hover {
    border-color: rgba(255, 255, 255, 0.4);
    transform: scale(1.1);
  }

  .color-circle.active {
    border-color: rgba(100, 150, 255, 0.8);
    box-shadow: 0 0 0 3px rgba(100, 150, 255, 0.2);
  }

  .tool-divider {
    width: 1px;
    height: 24px;
    background: rgba(255, 255, 255, 0.15);
    margin: 0 0.5rem;
  }

  .modal-right {
    width: 400px;
    display: flex;
    flex-direction: column;
    background: #0a0a0a;
    padding: 1.5rem;
    overflow-y: auto;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .modal-close-btn {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.5);
    font-size: 28px;
    line-height: 1;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-close-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.9);
  }

  .modal-fields {
    flex: 1;
    overflow-y: auto;
  }

  .modal-section-title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
  }

  .modal-field {
    margin-bottom: 1.5rem;
  }

  .modal-label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.7);
  }

  .modal-input {
    width: 100%;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.95);
    font-size: 0.95rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    outline: none;
    transition: all 0.2s;
    box-sizing: border-box;
  }

  .modal-input:focus {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(100, 150, 255, 0.5);
  }

  .modal-input::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }

  .color-input-group {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .modal-color-picker {
    width: 60px;
    height: 44px;
    padding: 4px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .modal-color-picker:hover {
    border-color: rgba(255, 255, 255, 0.25);
  }

  .modal-color-text {
    flex: 1;
    font-family: 'Monaco', 'Menlo', monospace;
    text-transform: uppercase;
  }

  .modal-textarea {
    width: 100%;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.95);
    font-size: 0.95rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    resize: vertical;
    outline: none;
    transition: all 0.2s;
    box-sizing: border-box;
  }

  .modal-textarea:focus {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(100, 150, 255, 0.5);
  }

  .modal-textarea::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    margin-top: 2rem;
  }

  .modal-btn {
    padding: 0.65rem 1.5rem;
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .modal-btn-cancel {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.15);
  }

  .modal-btn-cancel:hover {
    background: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.9);
  }

  .modal-btn-primary {
    background: rgba(100, 150, 255, 0.15);
    color: rgba(100, 150, 255, 0.95);
    border: 1px solid rgba(100, 150, 255, 0.3);
  }

  .modal-btn-primary:hover {
    background: rgba(100, 150, 255, 0.25);
    border-color: rgba(100, 150, 255, 0.5);
  }

  .modal-btn-save {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
  }

  .modal-btn-save:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }
</style>
