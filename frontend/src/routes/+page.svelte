<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { flip } from 'svelte/animate'
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
  import VideoMedia from '../lib/VideoMedia.svelte'

  // Environment detection - will be set in onMount
  let WS_URL = $state('')
  let API_URL = $state('')

  const SHEET_ID = 'test-sheet-1'  // Persistent sheet for testing

  // Generate a unique user ID for this session
  const USER_ID = `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

  let sheet: SheetConnection | null = null
  let rows: string[] = $state([])
  let cols: string[] = $state([])
  let cellsMap: Map<string, { cardId: string }> = $state(new Map())
  let cardsMetadata: Map<string, any> = $state(new Map())
  let shotTitles: Map<string, string> = $state(new Map())

  // ============================================================================
  // TIME/LANES ABSTRACTION
  // ============================================================================
  // Orientation: 'vertical' = column-major (time flows down), 'horizontal' = row-major (time flows right)
  type Orientation = 'vertical' | 'horizontal'
  let orientation: Orientation = 'vertical'  // Hardcoded to vertical for Phase 1

  // Semantic mapping: which axis represents time flow, which represents parallel lanes
  let timeline = $derived(orientation === 'vertical' ? rows : cols)
  let lanes = $derived(orientation === 'vertical' ? cols : rows)

  // The first lane is the fixed header (first column in vertical, first row in horizontal)
  let fixedLane = $derived(lanes.length > 0 ? lanes[0] : null)

  // Helper: Construct cell key from semantic time/lane IDs
  function cellKey(timeId: string, laneId: string): string {
    return orientation === 'vertical'
      ? `${timeId}:${laneId}`   // vertical: row:col
      : `${laneId}:${timeId}`   // horizontal: col:row (swapped)
  }

  // Helper: Parse cell key into semantic time/lane IDs
  function parseCellKey(key: string): { timeId: string; laneId: string } {
    const [a, b] = key.split(':')
    return orientation === 'vertical'
      ? { timeId: a, laneId: b }      // vertical: a=row=time, b=col=lane
      : { timeId: b, laneId: a }      // horizontal: a=col=lane, b=row=time
  }
  // ============================================================================

  // Derived arrays that always include one extra phantom column and row for scrolling
  let displayCols = $derived([...cols, `phantom-col-${cols.length}`])
  let displayRows = $derived([...rows, `phantom-row-${rows.length}`])
  let loading = $state(true)
  let draggedCard: { timeId: string; laneId: string; cardId: string } | null = null
  let dragPreview: { targetLane: string; targetTime: string; insertBefore: boolean } | null = $state(null)
  let isDragging = $state(false)
  let dragMousePos = $state({ x: 0, y: 0 })

  // Column Drag State
  let draggedColumn: string | null = null
  let columnDragPreview: { targetColIndex: number; insertBefore: boolean } | null = $state(null)
  let isColumnDragging = $state(false)

  // Column menu state
  let openColumnMenu: string | null = $state(null)

  // Scroll sync refs
  let frozenRowRef: HTMLDivElement | null = null
  let columnsContainerRef: HTMLDivElement | null = null

  // Confirmation dialog state
  let showConfirmDialog = $state(false)
  let confirmMessage = $state('')
  let confirmCallback: (() => void) | null = null

  // Toast notification state
  let showToast = $state(false)
  let toastMessage = $state('')
  let toastTimeout: number | null = null

  let showModal = $state(false)
  let modalCardId = $state<string | null>(null)
  let modalMediaId = $state<string | null>(null)  // Specific media/attachment being edited
  let modalPrompt = $state('')
  let promptTextRef: HTMLTextAreaElement | null = null
  let promptYText: Y.Text | null = null
  let modalTitle = $state('')
  let modalColor = $state('#CCCCCC')
  let modalMediaUrl = $state<string | null>(null)  // URL of media to display in modal
  let modalMediaType = $state<string | null>(null)  // "image" or "video"
  let modalThumbUrl = $state<string | null>(null)  // Thumbnail URL for video poster
  let attachments: any[] = $state([])  // Attachments for current card

  // Canvas drawing state
  let canvasRef: HTMLCanvasElement | null = null
  let isDrawing = $state(false)
  let currentColor = $state('white')
  let drawingStrokes: any[] = $state([])

  // Per-media drawing undo/redo stacks (keyed by mediaId)
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
  const loadedStickyTopRow = typeof localStorage !== 'undefined'
    ? localStorage.getItem('stickyTopRow') !== 'false'
    : true

  let selectedThumbnailSize = $state(loadedThumbnailSize)
  let stickyTopRow = $state(loadedStickyTopRow)
  let showThumbnailMenu = $state(false)
  let isSoundMuted = $state(loadedMuteState)
  let openEllipsisMenu: string | null = $state(null) // Track which column's menu is open

  // Undo stack - stores operations that can be undone
  interface UndoOperation {
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

    // Map row/col IDs to semantic time/lane based on orientation
    const time = orientation === 'vertical' ? rowId : colId
    const lane = orientation === 'vertical' ? colId : rowId

    // Check if this is the first time position (frozen header) - deleting it deletes the whole lane
    const isFirstTime = timeline.length > 0 && time === timeline[0]

    if (isFirstTime) {
      // Count how many cards are in this lane
      const cardsInLane = timeline.filter(t => {
        const key = cellKey(t, lane)
        const cell = cellsMap.get(key)
        return cell && cell.cardId
      }).length

      showConfirm(
        `Delete this entire lane? This will delete ${cardsInLane} card${cardsInLane !== 1 ? 's' : ''} and cannot be undone.`,
        () => deleteColumn(colId)
      )
    } else {
      // Save to undo stack before deleting single card
      const key = cellKey(time, lane)
      const cell = cellsMap.get(key)
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

      // Delete the card
      sheet.cells.delete(key)

      // Shift cards up in this lane to fill the gap (Kanban style)
      const allTimes = timeline
      const deletedTimeIndex = allTimes.indexOf(time)

      // Shift all cards below the deleted card up by one time position
      for (let i = deletedTimeIndex + 1; i < allTimes.length; i++) {
        const currentKey = cellKey(allTimes[i], lane)
        const prevKey = cellKey(allTimes[i - 1], lane)
        const card = sheet.cells.get(currentKey)

        if (card) {
          // Move card from current time to previous time
          sheet.cells.delete(currentKey)
          sheet.cells.set(prevKey, card)
        }
      }

      console.log('[handleDeleteCard] Deleted card and shifted lane up:', time, lane)
    }
  }

  // Delete entire lane
  function deleteColumn(colId: string) {
    if (!sheet) return

    const colIndex = cols.indexOf(colId)
    if (colIndex === -1) return

    // Map colId to semantic lane
    const lane = orientation === 'vertical' ? colId : colId

    // Save lane state for undo
    const columnCells = new Map<string, { cardId: string }>()
    timeline.forEach(timeId => {
      const key = cellKey(timeId, lane)
      const cell = sheet!.cells.get(key)
      if (cell) {
        columnCells.set(key, { ...cell })
      }
    })

    // Save to undo stack
    undoStack.push({
      type: 'deleteColumn',
      userId: USER_ID,
      colId,
      columnIndex: colIndex,
      columnCells
    })
    // Clear redo stack on new action
    redoStack = []

    // Delete all cells in this lane
    timeline.forEach(timeId => {
      const key = cellKey(timeId, lane)
      sheet!.cells.delete(key)
    })

    // Remove lane from colOrder
    sheet.colOrder.delete(colIndex, 1)

    console.log('[deleteColumn] Deleted lane:', lane, 'saved to undo stack')
  }

  // Duplicate lane
  function duplicateColumn(sourceColId: string) {
    if (!sheet) return

    const colsArray = sheet.colOrder.toArray()
    const sourceIndex = colsArray.indexOf(sourceColId)
    if (sourceIndex === -1) return

    // Generate a new lane ID
    const newColId = `c-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`

    // Map to semantic lanes
    const sourceLane = orientation === 'vertical' ? sourceColId : sourceColId
    const newLane = orientation === 'vertical' ? newColId : newColId

    // Insert new lane immediately after source lane
    colsArray.splice(sourceIndex + 1, 0, newColId)
    sheet.colOrder.delete(0, sheet.colOrder.length)
    sheet.colOrder.push(colsArray)

    // Save to undo stack
    undoStack.push({
      type: 'duplicateColumn',
      userId: USER_ID,
      colId: newColId,
      sourceColId: sourceColId
    })
    redoStack = []

    // Copy all cells from source lane to new lane
    timeline.forEach(timeId => {
      const sourceKey = cellKey(timeId, sourceLane)
      const cell = sheet!.cells.get(sourceKey)
      if (cell) {
        const newKey = cellKey(timeId, newLane)
        sheet!.cells.set(newKey, { ...cell })
      }
    })

    console.log('[duplicateColumn] Duplicated lane', sourceLane, 'to', newLane, 'at index', sourceIndex + 1)
  }

  function toggleColumnMenu(colId: string, e: MouseEvent) {
    e.stopPropagation()
    openColumnMenu = openColumnMenu === colId ? null : colId
  }

  function closeColumnMenu() {
    openColumnMenu = null
  }

  // Column drag handlers
  function handleColumnDragStart(e: DragEvent, laneId: string) {
    draggedColumn = laneId
    isColumnDragging = true

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
      dragPreview.style.gap = `${THUMBNAIL_SIZES[selectedThumbnailSize].width * 0.035}px`
      dragPreview.style.opacity = '0.7'
      dragPreview.style.pointerEvents = 'none'

      // Find all cards in this lane
      const laneIndex = lanes.indexOf(laneId)
      const laneCards = timeline.map(timeId => {
        const key = cellKey(timeId, laneId)
        const cell = cellsMap.get(key)
        const cardId = cell?.cardId
        return cardId ? cardsMetadata.get(cardId) : null
      }).filter(card => card !== null)

      // Add card previews to the drag image
      laneCards.forEach(card => {
        const cardDiv = document.createElement('div')
        cardDiv.style.width = `${THUMBNAIL_SIZES[selectedThumbnailSize].width}px`
        cardDiv.style.height = `${THUMBNAIL_SIZES[selectedThumbnailSize].height}px`
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
      const cardHeight = THUMBNAIL_SIZES[selectedThumbnailSize].height
      const gap = THUMBNAIL_SIZES[selectedThumbnailSize].width * 0.035
      const totalHeight = laneCards.length * cardHeight + (laneCards.length - 1) * gap

      // Position cursor at center of column (horizontally and vertically)
      // This ensures dragover events fire when any part of the column overlaps a drop zone
      const xOffset = THUMBNAIL_SIZES[selectedThumbnailSize].width / 2
      const yOffset = totalHeight / 2

      e.dataTransfer.setDragImage(dragPreview, xOffset, yOffset)

      // Remove the preview element after a brief delay
      setTimeout(() => {
        document.body.removeChild(dragPreview)
      }, 0)
    }

    console.log('[handleColumnDragStart] Dragging lane:', laneId)
  }

  function handleColumnDragOver(e: DragEvent, targetLaneId: string) {
    e.preventDefault()

    if (!draggedColumn || draggedColumn === targetLaneId) {
      columnDragPreview = null
      return
    }

    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move'
    }

    // Calculate if we should insert before or after the target
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const midpoint = rect.left + rect.width / 2
    const insertBefore = e.clientX < midpoint

    const sourceIndex = lanes.indexOf(draggedColumn)
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
      columnDragPreview = null
      return
    }

    columnDragPreview = {
      targetColIndex: targetIndex,
      insertBefore
    }
  }

  function handleColumnDrop(e: DragEvent, targetLaneId: string) {
    e.preventDefault()
    e.stopPropagation()

    console.log('[handleColumnDrop] Drop event', { draggedColumn, targetLaneId })

    if (!draggedColumn || !sheet || draggedColumn === targetLaneId) {
      console.log('[handleColumnDrop] Early exit:', { draggedColumn, hasSheet: !!sheet, sameTarget: draggedColumn === targetLaneId })
      resetColumnDrag()
      return
    }

    // Get the lane order array from Yjs (use colOrder in vertical mode, rowOrder in horizontal)
    const laneOrder = orientation === 'vertical' ? sheet.colOrder : sheet.rowOrder
    const lanesArray = laneOrder.toArray()

    console.log('[handleColumnDrop] Lanes array:', lanesArray)

    const sourceIndex = lanesArray.indexOf(draggedColumn)
    const targetIndex = lanesArray.indexOf(targetLaneId)

    console.log('[handleColumnDrop] Indices:', { sourceIndex, targetIndex })

    if (sourceIndex === -1 || targetIndex === -1) {
      console.log('[handleColumnDrop] Invalid indices, exiting')
      resetColumnDrag()
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

    console.log('[handleColumnDrop] Final index calculation:', { insertBefore, finalIndex })

    if (sourceIndex !== finalIndex) {
      // Save to undo stack
      undoStack.push({
        type: 'reorderColumn',
        userId: USER_ID,
        colId: draggedColumn,
        fromIndex: sourceIndex,
        toIndex: finalIndex
      })
      redoStack = []

      // Reorder in Yjs
      const [movedLane] = lanesArray.splice(sourceIndex, 1)
      lanesArray.splice(finalIndex, 0, movedLane)

      console.log('[handleColumnDrop] New lanes array:', lanesArray)

      // Update Yjs
      laneOrder.delete(0, laneOrder.length)
      laneOrder.push(lanesArray)

      console.log('[handleColumnDrop] Reordered lane', draggedColumn, 'from', sourceIndex, 'to', finalIndex)
    } else {
      console.log('[handleColumnDrop] No reorder needed, sourceIndex === finalIndex')
    }

    resetColumnDrag()
  }

  function resetColumnDrag() {
    draggedColumn = null
    isColumnDragging = false
    columnDragPreview = null
  }

  // Handle escape key to cancel drag operations
  function handleEscapeKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      // Cancel card drag
      if (isDragging || dragPreview || draggedCard) {
        console.log('[handleEscapeKey] Canceling card drag')
        isDragging = false
        dragPreview = null
        draggedCard = null
      }
      // Cancel column drag
      if (isColumnDragging || columnDragPreview || draggedColumn) {
        console.log('[handleEscapeKey] Canceling column drag')
        resetColumnDrag()
      }
    }
  }

  // Set up keyboard event listener
  $effect(() => {
    const handleKeyDown = (e: KeyboardEvent) => handleEscapeKey(e)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  })

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
      // Undo a card move: reverse all the shift operations
      // Save to redo stack
      redoStack.push(operation)

      // Map operation row/col to time/lane based on current orientation
      const toTime = orientation === 'vertical' ? operation.toRow : operation.toCol
      const toLane = orientation === 'vertical' ? operation.toCol : operation.toRow
      const fromTime = orientation === 'vertical' ? operation.fromRow : operation.fromCol
      const fromLane = orientation === 'vertical' ? operation.fromCol : operation.fromRow

      // Step 1: Remove card from target position
      const toKey = cellKey(toTime, toLane)
      const card = sheet.cells.get(toKey)

      if (!card) {
        console.log('[handleUndo] Card not found at target position')
        return
      }

      sheet.cells.delete(toKey)
      console.log('[handleUndo] Removed card from:', toKey)

      // Step 2: Get all time points and find positions
      const allTimes = timeline
      const fromTimeIndex = allTimes.indexOf(fromTime)
      const toTimeIndex = allTimes.indexOf(toTime)

      // Step 3: Shift cards in target lane forward in time to fill the gap (reverse of step 4 in move)
      for (let i = toTimeIndex + 1; i < allTimes.length; i++) {
        const currentKey = cellKey(allTimes[i], toLane)
        const prevKey = cellKey(allTimes[i - 1], toLane)
        const shiftCard = sheet.cells.get(currentKey)
        if (shiftCard) {
          sheet.cells.delete(currentKey)
          sheet.cells.set(prevKey, shiftCard)
        }
      }

      // Step 4: Shift cards in source lane backward in time from original position (reverse of step 3 in move)
      for (let i = allTimes.length - 1; i > fromTimeIndex; i--) {
        const prevKey = cellKey(allTimes[i - 1], fromLane)
        const currentKey = cellKey(allTimes[i], fromLane)
        const shiftCard = sheet.cells.get(prevKey)
        if (shiftCard && i < allTimes.length) {
          sheet.cells.delete(prevKey)
          sheet.cells.set(currentKey, shiftCard)
        }
      }

      // Step 5: Place card back at original position
      const fromKey = cellKey(fromTime, fromLane)
      sheet.cells.set(fromKey, card)
      console.log('[handleUndo] Restored card to original position:', fromKey)
    } else if (operation.type === 'delete' && sheet) {
      // Save current state (empty cell) to redo stack
      redoStack.push(operation)

      // Map operation row/col to time/lane based on current orientation
      const deleteTime = orientation === 'vertical' ? operation.rowId : operation.colId
      const deleteLane = orientation === 'vertical' ? operation.colId : operation.rowId

      // Shift cards forward in time in this lane to make room (reverse of delete shift-up)
      const allTimes = timeline
      const restoredTimeIndex = allTimes.indexOf(deleteTime)

      // Shift all cards from the restored position forward in time (in reverse order)
      for (let i = allTimes.length - 1; i > restoredTimeIndex; i--) {
        const prevKey = cellKey(allTimes[i - 1], deleteLane)
        const currentKey = cellKey(allTimes[i], deleteLane)
        const card = sheet.cells.get(prevKey)

        if (card) {
          // Move card from earlier time to later time (forward in time)
          sheet.cells.delete(prevKey)
          sheet.cells.set(currentKey, card)
        }
      }

      // Re-add the card to the cell
      const key = cellKey(deleteTime, deleteLane)
      sheet.cells.set(key, { cardId: operation.cardId })
      console.log('[handleUndo] Restored card to', key, 'and shifted lane forward in time')
    } else if (operation.type === 'insert' && sheet) {
      // Undo card insert by deleting it
      // Save to redo stack
      redoStack.push(operation)

      // Map operation row/col to time/lane based on current orientation
      const insertTime = orientation === 'vertical' ? operation.rowId : operation.colId
      const insertLane = orientation === 'vertical' ? operation.colId : operation.rowId

      // Delete the card from the cell
      const key = cellKey(insertTime, insertLane)
      sheet.cells.delete(key)

      // Shift cards backward in time in this lane to fill the gap
      const allTimes = timeline
      const deletedTimeIndex = allTimes.indexOf(insertTime)

      // Shift all cards after the deleted card backward in time (to earlier times)
      for (let i = deletedTimeIndex + 1; i < allTimes.length; i++) {
        const currentKey = cellKey(allTimes[i], insertLane)
        const prevKey = cellKey(allTimes[i - 1], insertLane)
        const card = sheet.cells.get(currentKey)

        if (card) {
          // Move card from later time to earlier time (backward in time)
          sheet.cells.delete(currentKey)
          sheet.cells.set(prevKey, card)
        }
      }

      console.log('[handleUndo] Deleted inserted card from', key, 'and shifted lane backward in time')
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
    } else if (operation.type === 'reorderColumn' && sheet) {
      // Undo lane reorder
      redoStack.push(operation)

      const laneOrder = orientation === 'vertical' ? sheet.colOrder : sheet.rowOrder
      const lanesArray = laneOrder.toArray()
      const [movedLane] = lanesArray.splice(operation.toIndex, 1)
      lanesArray.splice(operation.fromIndex, 0, movedLane)

      laneOrder.delete(0, laneOrder.length)
      laneOrder.push(lanesArray)

      console.log('[handleUndo] Restored lane order', operation.colId, 'from', operation.toIndex, 'to', operation.fromIndex)
    } else if (operation.type === 'duplicateColumn' && sheet) {
      // Undo lane duplication by deleting the duplicated lane
      redoStack.push(operation)

      const laneOrder = orientation === 'vertical' ? sheet.colOrder : sheet.rowOrder
      const lanesArray = laneOrder.toArray()
      const laneIndex = lanesArray.indexOf(operation.colId)

      if (laneIndex !== -1) {
        // Delete the lane from laneOrder
        lanesArray.splice(laneIndex, 1)
        laneOrder.delete(0, laneOrder.length)
        laneOrder.push(lanesArray)

        // Delete all cells in this lane
        timeline.forEach(timeId => {
          const key = cellKey(timeId, operation.colId)
          sheet!.cells.delete(key)
        })

        console.log('[handleUndo] Deleted duplicated lane', operation.colId)
      }
    } else if (operation.type === 'deleteColumn' && sheet) {
      // Undo lane deletion by restoring the lane
      redoStack.push(operation)

      // Restore the lane to laneOrder
      const laneOrder = orientation === 'vertical' ? sheet.colOrder : sheet.rowOrder
      const lanesArray = laneOrder.toArray()
      lanesArray.splice(operation.columnIndex!, 0, operation.colId!)
      laneOrder.delete(0, laneOrder.length)
      laneOrder.push(lanesArray)

      // Restore all cells in the lane (cell keys are already correctly formatted)
      if (operation.columnCells) {
        operation.columnCells.forEach((cell, key) => {
          sheet!.cells.set(key, { ...cell })
        })
      }

      console.log('[handleUndo] Restored deleted lane', operation.colId)
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
      // Redo a card move: replay all the shift operations from the original move
      // Save to undo stack
      undoStack.push(operation)

      // Map row/col to time/lane based on orientation
      const fromTime = orientation === 'vertical' ? operation.fromRow : operation.fromCol
      const fromLane = orientation === 'vertical' ? operation.fromCol : operation.fromRow
      const toTime = orientation === 'vertical' ? operation.toRow : operation.toCol
      const toLane = orientation === 'vertical' ? operation.toCol : operation.toRow

      // Step 1: Remove card from source position
      const fromKey = cellKey(fromTime, fromLane)
      const card = sheet.cells.get(fromKey)

      if (!card) {
        console.log('[handleRedo] Card not found at source position')
        return
      }

      sheet.cells.delete(fromKey)
      console.log('[handleRedo] Removed card from:', fromKey)

      // Step 2: Get all times and find positions
      const allTimes = timeline
      const fromTimeIndex = allTimes.indexOf(fromTime)
      const toTimeIndex = allTimes.indexOf(toTime)

      // Step 3: Shift cards in source lane UP to fill the gap
      for (let i = fromTimeIndex + 1; i < allTimes.length; i++) {
        const currentKey = cellKey(allTimes[i], fromLane)
        const prevKey = cellKey(allTimes[i - 1], fromLane)
        const shiftCard = sheet.cells.get(currentKey)
        if (shiftCard) {
          sheet.cells.delete(currentKey)
          sheet.cells.set(prevKey, shiftCard)
        }
      }

      // Step 4: Shift cards in target lane DOWN to make room
      for (let i = allTimes.length - 1; i > toTimeIndex; i--) {
        const prevKey = cellKey(allTimes[i - 1], toLane)
        const currentKey = cellKey(allTimes[i], toLane)
        const shiftCard = sheet.cells.get(prevKey)
        if (shiftCard && i < allTimes.length) {
          sheet.cells.delete(prevKey)
          sheet.cells.set(currentKey, shiftCard)
        }
      }

      // Step 5: Place card at target position
      const toKey = cellKey(toTime, toLane)
      sheet.cells.set(toKey, card)
      console.log('[handleRedo] Re-moved card to:', toKey)
    } else if (operation.type === 'delete' && sheet) {
      // Save to undo stack
      undoStack.push(operation)

      // Map row/col to time/lane based on orientation
      const time = orientation === 'vertical' ? operation.rowId : operation.colId
      const lane = orientation === 'vertical' ? operation.colId : operation.rowId

      // Remove the card from the cell
      const key = cellKey(time, lane)
      sheet.cells.delete(key)

      // Shift cards up in this lane to fill the gap (same as handleDeleteCard)
      const allTimes = timeline
      const deletedTimeIndex = allTimes.indexOf(time)

      // Shift all cards below the deleted card up by one time position
      for (let i = deletedTimeIndex + 1; i < allTimes.length; i++) {
        const currentKey = cellKey(allTimes[i], lane)
        const prevKey = cellKey(allTimes[i - 1], lane)
        const card = sheet.cells.get(currentKey)

        if (card) {
          // Move card from current time to previous time
          sheet.cells.delete(currentKey)
          sheet.cells.set(prevKey, card)
        }
      }

      console.log('[handleRedo] Re-deleted card from', key, 'and shifted lane up')
    } else if (operation.type === 'insert' && sheet) {
      // Redo card insert by re-adding it to the cell
      // Save to undo stack
      undoStack.push(operation)

      // Map row/col to time/lane based on orientation
      const time = orientation === 'vertical' ? operation.rowId : operation.colId
      const lane = orientation === 'vertical' ? operation.colId : operation.rowId

      // Shift cards down in this lane to make room (reverse of undo insert)
      const allTimes = timeline
      const restoredTimeIndex = allTimes.indexOf(time)

      // Shift all cards from the restored position down by one time position (in reverse order)
      for (let i = allTimes.length - 1; i > restoredTimeIndex; i--) {
        const prevKey = cellKey(allTimes[i - 1], lane)
        const currentKey = cellKey(allTimes[i], lane)
        const card = sheet.cells.get(prevKey)

        if (card) {
          // Move card from previous time to current time
          sheet.cells.delete(prevKey)
          sheet.cells.set(currentKey, card)
        }
      }

      // Re-add the card to the cell
      const key = cellKey(time, lane)
      sheet.cells.set(key, { cardId: operation.cardId })
      console.log('[handleRedo] Re-inserted card to', key, 'and shifted lane down')
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
    } else if (operation.type === 'reorderColumn' && sheet) {
      // Redo lane reorder
      undoStack.push(operation)

      const laneOrder = orientation === 'vertical' ? sheet.colOrder : sheet.rowOrder
      const lanesArray = laneOrder.toArray()
      const [movedLane] = lanesArray.splice(operation.fromIndex, 1)
      lanesArray.splice(operation.toIndex, 0, movedLane)

      laneOrder.delete(0, laneOrder.length)
      laneOrder.push(lanesArray)

      console.log('[handleRedo] Re-reordered lane', operation.colId, 'from', operation.fromIndex, 'to', operation.toIndex)
    } else if (operation.type === 'duplicateColumn' && sheet) {
      // Redo lane duplication
      undoStack.push(operation)

      // Re-add the lane
      const laneOrder = orientation === 'vertical' ? sheet.colOrder : sheet.rowOrder
      const lanesArray = laneOrder.toArray()
      const sourceIndex = lanesArray.indexOf(operation.sourceColId)

      if (sourceIndex !== -1) {
        lanesArray.splice(sourceIndex + 1, 0, operation.colId)
        laneOrder.delete(0, laneOrder.length)
        laneOrder.push(lanesArray)

        // Re-copy all cells from source lane
        timeline.forEach(timeId => {
          const sourceKey = cellKey(timeId, operation.sourceColId)
          const cell = sheet!.cells.get(sourceKey)
          if (cell) {
            const newKey = cellKey(timeId, operation.colId)
            sheet!.cells.set(newKey, { ...cell })
          }
        })

        console.log('[handleRedo] Re-duplicated lane', operation.sourceColId, 'to', operation.colId)
      }
    } else if (operation.type === 'deleteColumn' && sheet) {
      // Redo lane deletion
      undoStack.push(operation)

      const laneOrder = orientation === 'vertical' ? sheet.colOrder : sheet.rowOrder
      const lanesArray = laneOrder.toArray()
      const laneIndex = lanesArray.indexOf(operation.colId!)

      if (laneIndex !== -1) {
        // Delete the lane from laneOrder
        lanesArray.splice(laneIndex, 1)
        laneOrder.delete(0, laneOrder.length)
        laneOrder.push(lanesArray)

        // Delete all cells in the lane
        timeline.forEach(timeId => {
          const key = cellKey(timeId, operation.colId)
          sheet!.cells.delete(key)
        })

        console.log('[handleRedo] Re-deleted lane', operation.colId)
      }
    }
  }

  // Drag & Drop handlers with visual preview
  function handleDragStart(event: DragEvent, timeId: string, laneId: string, cardId: string) {
    // Skip frozen time position (first time slot, which is the header row in vertical mode)
    if (timeline.length > 0 && timeId === timeline[0]) {
      event.preventDefault()
      return
    }

    draggedCard = { timeId, laneId, cardId }
    isDragging = true
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', cardId)
    }
    console.log('[handleDragStart] Started dragging:', cardId)
  }

  function handleDragOver(event: DragEvent, targetTime: string, targetLane: string, cardElement: HTMLElement) {
    event.preventDefault()
    if (!draggedCard || !isDragging) {
      console.log('[handleDragOver] Skipped - no draggedCard or not dragging')
      return
    }

    // Skip frozen time position as drop target (first time slot, which is header row in vertical mode)
    if (timeline.length > 0 && targetTime === timeline[0]) {
      dragPreview = null
      console.log('[handleDragOver] Skipped - frozen time position')
      return
    }

    // Don't show preview if it's the same cell
    if (draggedCard.timeId === targetTime && draggedCard.laneId === targetLane) {
      dragPreview = null
      return
    }

    // Track mouse position
    dragMousePos = { x: event.clientX, y: event.clientY }

    // Calculate if mouse is in top or bottom half of card (vertical orientation)
    // In future phases, this will adapt based on orientation
    const rect = cardElement.getBoundingClientRect()
    const mouseY = event.clientY
    const cardMidpoint = rect.top + (rect.height / 2)
    const insertBefore = mouseY < cardMidpoint

    // Update preview
    dragPreview = {
      targetLane,
      targetTime,
      insertBefore
    }

    console.log('[handleDragOver] Updated preview:', { targetTime, targetLane, insertBefore })

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

  function handleDrop(event: DragEvent, toTime: string, toLane: string) {
    event.preventDefault()
    if (!sheet || !draggedCard || !dragPreview) {
      console.log('[handleDrop] Missing required data:', { hasSheet: !!sheet, hasDraggedCard: !!draggedCard, hasDragPreview: !!dragPreview })
      isDragging = false
      dragPreview = null
      draggedCard = null
      return
    }

    const { timeId: fromTime, laneId: fromLane, cardId } = draggedCard
    const { targetTime, targetLane, insertBefore } = dragPreview

    console.log('[handleDrop] Dropping card:', {
      fromTime, fromLane, cardId,
      targetTime, targetLane, insertBefore,
      dropEventTime: toTime, dropEventLane: toLane
    })

    // Kanban-style move: shift cards within lanes
    // Step 1: Remove card from source
    const fromKey = cellKey(fromTime, fromLane)
    const cardData = sheet.cells.get(fromKey)

    if (!cardData) {
      console.log('[handleDrop] Card not found at source')
      isDragging = false
      dragPreview = null
      draggedCard = null
      return
    }

    sheet.cells.delete(fromKey)
    console.log('[handleDrop] Removed from:', fromKey)

    // Step 2: Get all time points and find positions
    const allTimes = timeline
    const fromTimeIndex = allTimes.indexOf(fromTime)
    const targetTimeIndex = allTimes.indexOf(targetTime)

    // Step 3: Shift cards in source lane to fill the gap (shift forward in time)
    if (fromLane === targetLane) {
      // Same lane - just need to shift and reorder
      for (let i = fromTimeIndex + 1; i < allTimes.length; i++) {
        const currentKey = cellKey(allTimes[i], fromLane)
        const prevKey = cellKey(allTimes[i - 1], fromLane)
        const card = sheet.cells.get(currentKey)
        if (card) {
          sheet.cells.delete(currentKey)
          sheet.cells.set(prevKey, card)
        }
      }
    } else {
      // Different lanes - shift source lane forward in time
      for (let i = fromTimeIndex + 1; i < allTimes.length; i++) {
        const currentKey = cellKey(allTimes[i], fromLane)
        const prevKey = cellKey(allTimes[i - 1], fromLane)
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
      const currentKey = cellKey(allTimes[i], targetLane)
      const nextKey = cellKey(allTimes[i + 1], targetLane)
      const card = sheet.cells.get(currentKey)
      if (card && i + 1 < allTimes.length) {
        sheet.cells.delete(currentKey)
        sheet.cells.set(nextKey, card)
      }
    }

    // Step 5: Place card at target
    const finalKey = cellKey(allTimes[insertAtIndex], targetLane)
    sheet.cells.set(finalKey, cardData)
    console.log('[handleDrop] Placed at:', finalKey)

    // Save to undo stack (still using row/col for backward compatibility with undo logic)
    const { timeId: finalTime, laneId: finalLane } = parseCellKey(finalKey)
    undoStack.push({
      type: 'move',
      userId: USER_ID,
      cardId: cardId,
      fromRow: orientation === 'vertical' ? fromTime : fromLane,
      fromCol: orientation === 'vertical' ? fromLane : fromTime,
      toRow: orientation === 'vertical' ? finalTime : finalLane,
      toCol: orientation === 'vertical' ? finalLane : finalTime
    })
    redoStack = []

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
      console.log('[handleKeydown] Canceling card drag with Escape')
      isDragging = false
      dragPreview = null
      draggedCard = null
      return
    }

    // Escape cancels column drag
    if (event.key === 'Escape' && isColumnDragging) {
      event.preventDefault()
      console.log('[handleKeydown] Canceling column drag with Escape')
      resetColumnDrag()
      return
    }

    // Check for Cmd+Z (Mac) or Ctrl+Z (Windows/Linux)
    if ((event.metaKey || event.ctrlKey) && event.key === 'z') {
      event.preventDefault()
      if (event.shiftKey) {
        handleRedo()
      } else {
        handleUndo()
      }
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

  // Toggle sticky top row
  function toggleStickyTopRow() {
    stickyTopRow = !stickyTopRow
    // Save to localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('stickyTopRow', stickyTopRow.toString())
    }
    console.log('[toggleStickyTopRow] Sticky top row is now:', stickyTopRow ? 'enabled' : 'disabled')
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

    // Set the media ID - for now, default media for the card
    // In the future, this could be a specific attachment ID
    modalMediaId = `${cardId}_default`

    modalTitle = card?.title || ''
    modalColor = card?.color || '#CCCCCC'
    modalPrompt = card?.prompt || ''
    modalMediaUrl = card?.media_url || null  // Display the full media in modal
    modalMediaType = card?.media_type || null  // "image" or "video"
    modalThumbUrl = card?.thumb_url || null  // Thumbnail for video poster
    attachments = card?.attachments || []

    // Set up Yjs Text for collaborative prompt editing
    if (sheet) {
      promptYText = sheet.doc.getText(`prompt_${cardId}`)

      // Initialize the Yjs Text with current prompt if empty
      if (promptYText.length === 0 && modalPrompt) {
        promptYText.insert(0, modalPrompt)
      } else {
        // Load from Yjs
        modalPrompt = promptYText.toString()
      }

      // Load existing drawings for this specific media
      const mediaDrawings = sheet.doc.getMap(`drawings_${modalMediaId}`)
      const strokesData = mediaDrawings.get('strokes')
      if (strokesData) {
        try {
          drawingStrokes = JSON.parse(strokesData as string)
        } catch (e) {
          drawingStrokes = []
        }
      } else {
        drawingStrokes = []
      }

      // Observe drawing changes from other users for this media
      mediaDrawings.observe(() => {
        const updatedStrokes = mediaDrawings.get('strokes')
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

    // Initialize canvas and prompt binding after modal is shown
    setTimeout(() => {
      if (canvasRef) {
        initCanvas(canvasRef)
      }
      if (promptTextRef && promptYText) {
        bindPromptToYjs()
      }
    }, 100)
  }

  // Close modal
  function closeModal() {
    // Cleanup Yjs binding
    if (promptTextRef && (promptTextRef as any)._yjsCleanup) {
      (promptTextRef as any)._yjsCleanup()
    }

    showModal = false
    modalCardId = null
    modalMediaId = null
    modalPrompt = ''
    modalTitle = ''
    modalColor = '#CCCCCC'
    promptYText = null
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
    if (sheet && modalMediaId) {
      const mediaDrawings = sheet.doc.getMap(`drawings_${modalMediaId}`)
      mediaDrawings.set('strokes', JSON.stringify(drawingStrokes))
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
      if (sheet && modalMediaId) {
        const mediaDrawings = sheet.doc.getMap(`drawings_${modalMediaId}`)
        mediaDrawings.set('strokes', JSON.stringify(drawingStrokes))
      }
    }
  }

  function stopDrawing() {
    if (isDrawing && modalMediaId) {
      // Save current state to history when stroke is complete (per media)
      const history = drawingHistory.get(modalMediaId) || []
      history.push(JSON.parse(JSON.stringify(drawingStrokes)))
      drawingHistory.set(modalMediaId, history)

      // Clear redo stack on new stroke
      drawingRedoStack.set(modalMediaId, [])
    }
    isDrawing = false
  }

  function undoStroke() {
    if (!modalMediaId) return

    const history = drawingHistory.get(modalMediaId) || []
    if (history.length === 0) return

    // Pop the last state from history
    const previousState = history.pop()
    drawingHistory.set(modalMediaId, history)

    // Save current state to redo stack
    const redoStack = drawingRedoStack.get(modalMediaId) || []
    redoStack.push(JSON.parse(JSON.stringify(drawingStrokes)))
    drawingRedoStack.set(modalMediaId, redoStack)

    // Restore previous state
    if (previousState) {
      drawingStrokes = previousState
      redrawCanvas()

      // Sync to Yjs
      if (sheet) {
        const mediaDrawings = sheet.doc.getMap(`drawings_${modalMediaId}`)
        mediaDrawings.set('strokes', JSON.stringify(drawingStrokes))
      }
    }
  }

  function redoStroke() {
    if (!modalMediaId) return

    const redoStack = drawingRedoStack.get(modalMediaId) || []
    if (redoStack.length === 0) return

    // Pop from redo stack
    const nextState = redoStack.pop()
    drawingRedoStack.set(modalMediaId, redoStack)

    // Save current state to history
    const history = drawingHistory.get(modalMediaId) || []
    history.push(JSON.parse(JSON.stringify(drawingStrokes)))
    drawingHistory.set(modalMediaId, history)

    // Restore next state
    if (nextState) {
      drawingStrokes = nextState
      redrawCanvas()

      // Sync to Yjs
      if (sheet) {
        const mediaDrawings = sheet.doc.getMap(`drawings_${modalMediaId}`)
        mediaDrawings.set('strokes', JSON.stringify(drawingStrokes))
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
    if (sheet && modalMediaId) {
      const mediaDrawings = sheet.doc.getMap(`drawings_${modalMediaId}`)
      mediaDrawings.set('strokes', JSON.stringify([]))
    }
  }

  // Bind textarea to Yjs Text for collaborative editing
  function bindPromptToYjs() {
    if (!promptTextRef || !promptYText) return

    let isLocalChange = false

    // Handle local input events
    const handleInput = () => {
      if (!promptTextRef || !promptYText) return
      isLocalChange = true

      const currentText = promptYText.toString()
      const newText = promptTextRef.value

      // Calculate diff and apply to Yjs
      if (currentText !== newText) {
        promptYText.delete(0, currentText.length)
        promptYText.insert(0, newText)
      }

      isLocalChange = false
    }

    // Observe remote changes from other users
    const observer = () => {
      if (isLocalChange || !promptTextRef || !promptYText) return

      const newText = promptYText.toString()

      // Only update if there's an actual change
      if (promptTextRef.value === newText) return

      // Check if user is actively editing this field
      const isActivelyEditing = document.activeElement === promptTextRef

      if (isActivelyEditing) {
        // User is typing - preserve cursor position carefully
        const start = promptTextRef.selectionStart || 0
        const end = promptTextRef.selectionEnd || 0

        promptTextRef.value = newText
        modalPrompt = newText

        // Restore cursor position
        requestAnimationFrame(() => {
          if (promptTextRef) {
            promptTextRef.setSelectionRange(start, end)
          }
        })
      } else {
        // User is not editing - just update the value
        promptTextRef.value = newText
        modalPrompt = newText
      }
    }

    promptYText.observe(observer)
    promptTextRef.addEventListener('input', handleInput)

    // Cleanup on modal close
    const cleanup = () => {
      if (promptYText) {
        promptYText.unobserve(observer)
      }
      if (promptTextRef) {
        promptTextRef.removeEventListener('input', handleInput)
      }
    }

    // Store cleanup function for later use
    ;(promptTextRef as any)._yjsCleanup = cleanup
  }

  // Format JSON in the prompt field
  function formatPromptAsJSON() {
    if (!modalPrompt) return

    try {
      // Try to parse and format as JSON
      const parsed = JSON.parse(modalPrompt)
      const formatted = JSON.stringify(parsed, null, 2)

      if (promptYText) {
        promptYText.delete(0, promptYText.length)
        promptYText.insert(0, formatted)
      }
      modalPrompt = formatted
      if (promptTextRef) {
        promptTextRef.value = formatted
      }
    } catch (e) {
      // If it's not valid JSON, just try to pretty-print it anyway
      console.warn('Prompt is not valid JSON, cannot format')
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

  // Confirmation dialog helpers
  function showConfirm(message: string, onConfirm: () => void) {
    confirmMessage = message
    confirmCallback = onConfirm
    showConfirmDialog = true
  }

  function handleConfirm() {
    if (confirmCallback) {
      confirmCallback()
    }
    showConfirmDialog = false
    confirmCallback = null
  }

  function handleCancelConfirm() {
    showConfirmDialog = false
    confirmCallback = null
  }

  // Toast notification helpers
  function showToastNotification(message: string, duration: number = 3000) {
    toastMessage = message
    showToast = true

    // Clear any existing timeout
    if (toastTimeout) {
      clearTimeout(toastTimeout)
    }

    // Auto-hide after duration (unless duration is 0, which means manual dismiss)
    if (duration > 0) {
      toastTimeout = setTimeout(() => {
        showToast = false
      }, duration) as unknown as number
    }
  }

  function hideToast() {
    showToast = false
    if (toastTimeout) {
      clearTimeout(toastTimeout)
      toastTimeout = null
    }
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

  // Handle column download
  async function handleColumnDownload(colId: string) {
    if (!sheet) return

    try {
      // Get lane title
      const lane = orientation === 'vertical' ? colId : colId
      const columnTitle = shotTitles.get(colId) || `Shot ${colId}`

      // Get all cards in this lane
      const columnCards = timeline.map(timeId => {
        const key = cellKey(timeId, lane)
        const cell = cellsMap.get(key)
        const cardId = cell?.cardId
        return cardId ? cardsMetadata.get(cardId) : null
      }).filter(card => card !== null)

      if (columnCards.length === 0) {
        showToastNotification('No cards in this column to export', 3000)
        return
      }

      // Show downloading toast
      showToastNotification('Downloading...', 0)

      // Call backend to generate zip
      const response = await fetch(`${API_URL}/api/columns/${colId}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columnCards,
          columnTitle
        })
      })

      if (!response.ok) {
        throw new Error('Failed to generate download')
      }

      // Download the zip file
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${columnTitle.replace(/\s+/g, '_')}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      console.log('[handleColumnDownload] Downloaded column:', colId)

      // Show success toast
      hideToast()
      showToastNotification('Download complete!', 3000)
    } catch (error) {
      console.error('Error downloading column:', error)
      hideToast()
      showToastNotification('Failed to download column', 3000)
    }
  }

  // Handle attachment upload
  async function handleAttachmentUpload(e: Event) {
    const target = e.target as HTMLInputElement
    const file = target.files?.[0]
    if (!file || !modalCardId) return

    try {
      // Create FormData for upload
      const formData = new FormData()
      formData.append('file', file)
      formData.append('cardId', modalCardId)

      // Upload to backend (which will store in GCS)
      const response = await fetch(`${API_URL}/api/attachments/upload`, {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const attachment = await response.json()
        // Add to attachments list
        attachments = [...attachments, attachment]

        // Sync to Yjs
        if (sheet) {
          const cardMeta = sheet.cardsMetadata.get(modalCardId)
          if (cardMeta) {
            const updatedAttachments = [...(cardMeta.attachments || []), attachment]
            sheet.cardsMetadata.set(modalCardId, { ...cardMeta, attachments: updatedAttachments })
          }
        }
      } else {
        console.error('Failed to upload attachment:', await response.text())
      }
    } catch (error) {
      console.error('Error uploading attachment:', error)
    }

    // Reset input
    target.value = ''
  }

  // Delete attachment
  async function deleteAttachment(attachmentId: string) {
    if (!modalCardId) return

    try {
      const response = await fetch(`${API_URL}/api/attachments/${attachmentId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        // Remove from local state
        attachments = attachments.filter(a => a.id !== attachmentId)

        // Sync to Yjs
        if (sheet) {
          const cardMeta = sheet.cardsMetadata.get(modalCardId)
          if (cardMeta) {
            const updatedAttachments = (cardMeta.attachments || []).filter((a: any) => a.id !== attachmentId)
            sheet.cardsMetadata.set(modalCardId, { ...cardMeta, attachments: updatedAttachments })
          }
        }
      } else {
        console.error('Failed to delete attachment:', await response.text())
      }
    } catch (error) {
      console.error('Error deleting attachment:', error)
    }
  }

  // Handle file upload for blank cell
  async function handleFileUpload(e: Event, rowId: string, colId: string) {
    const target = e.target as HTMLInputElement
    const file = target.files?.[0]
    if (!file || !sheet) return

    // If this is a phantom column, create a real column first
    let actualColId = colId
    if (colId.startsWith('phantom-col-')) {
      console.log('Creating new column for phantom column:', colId)
      actualColId = addCol(sheet)
    }

    // If this is a phantom row, create a real row first
    let actualRowId = rowId
    if (rowId.startsWith('phantom-row-')) {
      console.log('Creating new row for phantom row:', rowId)
      actualRowId = addRow(sheet)
    }

    // Update references to use actual IDs
    rowId = actualRowId
    colId = actualColId

    // Validate file type - allow images and videos
    const allowedTypes = [
      'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
      'video/mp4', 'video/quicktime', 'video/webm'
    ]
    if (!allowedTypes.includes(file.type)) {
      alert('Please upload an image (PNG, JPEG, WebP, GIF) or video (MP4, MOV, WebM) file')
      target.value = ''
      return
    }

    // Check file size (max 10MB for images, 100MB for videos)
    const isVideo = file.type.startsWith('video/')
    const maxSize = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024
    if (file.size > maxSize) {
      const maxMB = isVideo ? '100MB' : '10MB'
      alert(`File size must be less than ${maxMB}`)
      target.value = ''
      return
    }

    try {
      console.log('Uploading file:', file.name)

      // Map row/col to time/lane based on orientation
      const time = orientation === 'vertical' ? rowId : colId
      const lane = orientation === 'vertical' ? colId : rowId

      // Create a temporary loading card immediately
      const tempCardId = `temp_${Date.now()}`
      const key = cellKey(time, lane)

      // Add temporary card to Yjs
      sheet.cells.set(key, { cardId: tempCardId })

      // Add temporary card metadata with loading state
      const tempCard = {
        cardId: tempCardId,
        title: 'Uploading...',
        color: '#1a1a1a',
        isLoading: true, // Flag to show loading spinner
        createdAt: new Date().toISOString()
      }
      cardsMetadata = new Map(cardsMetadata.set(tempCardId, tempCard))

      // Create FormData for upload
      const formData = new FormData()
      formData.append('file', file)

      // Upload to backend
      const response = await fetch(`${API_URL}/api/media/upload`, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error('Upload failed')
      }

      const uploadResult = await response.json()
      console.log('Upload result:', uploadResult)

      // Create a new card with the media URLs
      const cardResponse = await fetch(`${API_URL}/api/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: file.name.split('.')[0], // Use filename without extension as title
          color: '#1a1a1a', // Dark color for media cards
          media_url: uploadResult.media_url,
          thumb_url: uploadResult.thumb_url,
          media_type: uploadResult.media_type // "image" or "video"
        })
      })

      if (!cardResponse.ok) {
        throw new Error('Failed to create card')
      }

      const newCard = await cardResponse.json()
      console.log('Created card:', newCard)

      // Remove temporary card from metadata
      cardsMetadata.delete(tempCardId)

      // Update Yjs with real card ID
      sheet.cells.set(key, { cardId: newCard.cardId })

      // Add real card metadata to local map - reassign for reactivity
      cardsMetadata = new Map(cardsMetadata.set(newCard.cardId, newCard))

      // Save to undo stack
      undoStack.push({
        type: 'insert',
        userId: USER_ID,
        rowId: rowId,
        colId: colId,
        cardId: newCard.cardId
      })
      // Clear redo stack on new action
      redoStack = []
      console.log('[handleFileUpload] Saved to undo stack:', undoStack.length)

      console.log('Card added to cell:', key)
    } catch (error) {
      console.error('Error uploading file:', error)
      alert('Failed to upload file. Please try again.')

      // Clean up temporary card on error
      const time = orientation === 'vertical' ? rowId : colId
      const lane = orientation === 'vertical' ? colId : rowId
      const key = cellKey(time, lane)
      sheet.cells.delete(key)
      cardsMetadata = new Map(cardsMetadata) // Trigger reactivity
    }

    // Reset input
    target.value = ''
  }

  // Sync horizontal scroll between frozen row and columns container
  function syncColumnsScroll(e: Event) {
    if (frozenRowRef && columnsContainerRef) {
      const target = e.target as HTMLElement
      if (target === columnsContainerRef) {
        frozenRowRef.scrollLeft = columnsContainerRef.scrollLeft
      } else if (target === frozenRowRef) {
        columnsContainerRef.scrollLeft = frozenRowRef.scrollLeft
      }
    }
  }

  // Mount/unmount
  onMount(async () => {
    // Detect environment and set URLs at runtime
    const isProduction = window.location.hostname !== 'localhost'
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'

    // Auto-detect URLs based on current location
    WS_URL = isProduction ? `${protocol}//${window.location.host}/yjs` : 'ws://localhost:8000/yjs'
    API_URL = isProduction ? `${window.location.protocol}//${window.location.host}` : 'http://localhost:8000'

    console.log('[Environment Detection]', {
      hostname: window.location.hostname,
      isProduction,
      protocol: window.location.protocol,
      WS_URL,
      API_URL
    })
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
              onclick={() => { toggleStickyTopRow(); toggleEllipsisMenu('toolbar'); }}
            >
              <span class="menu-checkbox">{stickyTopRow ? '✓' : ''}</span>
              Sticky top row
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
    <div class="sheet-view" onclick={closeColumnMenu}>
      <!-- Frozen header row with shot titles -->
      {#if stickyTopRow}
      <div
        bind:this={frozenRowRef}
        class="frozen-row"
        style="gap: {THUMBNAIL_SIZES[selectedThumbnailSize].width * 0.05}px"
        onscroll={syncColumnsScroll}
      >
        {#each displayCols as colId, colIndex (colId)}
          <div class="column-wrapper" animate:flip={{ duration: 300 }}>
            <!-- Column drop indicator -->
            {#if columnDragPreview && columnDragPreview.targetColIndex === colIndex && columnDragPreview.insertBefore}
              <div
                class="column-drop-indicator"
                style="min-width: {THUMBNAIL_SIZES[selectedThumbnailSize].width}px;"
                ondragover={(e) => { e.preventDefault(); handleColumnDragOver(e, colId); }}
                ondrop={(e) => { console.log('[frozen drop indicator before ondrop]'); handleColumnDrop(e, colId); }}
              ></div>
            {/if}
            <div
              class="shot-column {draggedColumn === colId ? 'column-dragging' : ''}"
              style="width: {THUMBNAIL_SIZES[selectedThumbnailSize].width}px"
              ondragover={(e) => handleColumnDragOver(e, colId)}
              ondrop={(e) => handleColumnDrop(e, colId)}
            >
            <!-- Title and icons on same line -->
            <div class="shot-header-title">
              <input
                type="text"
                class="shot-title-input"
                value={colId.startsWith('phantom-') ? '' : (shotTitles.get(colId) || `Shot ${colId.replace('c-', '').replace('media', '1').replace('alt', '2').replace('notes', '3')}`)}
                placeholder={colId.startsWith('phantom-') ? 'New column' : 'Shot title'}
                onchange={(e) => handleShotTitleChange(colId, e.currentTarget.value)}
                disabled={colId.startsWith('phantom-')}
              />
              {#if !colId.startsWith('phantom-')}
              <div class="shot-header-menu">
                <button class="icon-btn-header menu-btn" title="Column options" onclick={(e) => toggleColumnMenu(colId, e)}>
                  <span class="material-symbols-outlined">more_vert</span>
                </button>

                {#if openColumnMenu === colId}
                  <div class="column-dropdown-menu" onclick={(e) => e.stopPropagation()}>
                    <button class="menu-item" onclick={() => { duplicateColumn(colId); closeColumnMenu(); }}>
                      <span class="material-symbols-outlined">content_copy</span>
                      <span>Duplicate</span>
                    </button>
                    <button class="menu-item" onclick={closeColumnMenu}>
                      <span class="material-symbols-outlined">comment</span>
                      <span>Comment</span>
                    </button>
                    <button class="menu-item" onclick={() => { handleColumnDownload(colId); closeColumnMenu(); }}>
                      <span class="material-symbols-outlined">file_download</span>
                      <span>Download</span>
                    </button>
                    <button class="menu-item delete-item" onclick={() => { deleteColumn(colId); closeColumnMenu(); }}>
                      <span class="material-symbols-outlined">delete</span>
                      <span>Delete</span>
                    </button>
                  </div>
                {/if}
              </div>
              {/if}
            </div>

            <!-- First card (frozen) -->
            {#if timeline.length > 0}
              {@const firstTimeId = timeline[0]}
              {@const key = cellKey(firstTimeId, colId)}
              {@const cell = cellsMap.get(key)}
              {@const cardId = cell?.cardId}
              {@const card = cardId ? cardsMetadata.get(cardId) : null}

              {#if card}
                <div
                  class="shot-card column-drag-handle"
                  style="background-color: {card.thumb_url ? 'rgba(0, 0, 0, 0.3)' : card.color}; width: {THUMBNAIL_SIZES[selectedThumbnailSize].width}px; height: {THUMBNAIL_SIZES[selectedThumbnailSize].height}px"
                  draggable="true"
                  ondragstart={(e) => handleColumnDragStart(e, colId)}
                  ondragover={(e) => handleColumnDragOver(e, colId)}
                  ondrop={(e) => handleColumnDrop(e, colId)}
                  ondragend={resetColumnDrag}
                  ondblclick={() => handleCardDoubleClick(cardId)}
                >
                  {#if card.isLoading}
                    <!-- Loading spinner -->
                    <div class="upload-loading">
                      <div class="loading-spinner"></div>
                    </div>
                  {:else if card.media_type === 'video' && card.media_url && card.thumb_url}
                    <div ondragstart={(e) => e.preventDefault()}>
                      <VideoMedia src={card.media_url} thumbnail={card.thumb_url} />
                    </div>
                  {:else if card.thumb_url}
                    <img
                      src={card.thumb_url}
                      alt={card.title}
                      class="card-thumbnail"
                      loading="lazy"
                      decoding="async"
                      ondragstart={(e) => e.preventDefault()}
                    />
                  {/if}
                  {#if !card.thumb_url && !card.media_url && !card.isLoading}
                  <div class="card-title-container">
                    <input
                      type="text"
                      class="shot-title-input card-title-input"
                      value={card.number ? `${card.title} ${card.number}` : card.title}
                      oninput={(e) => handleCardTitleInput(cardId, e.currentTarget.value)}
                      onchange={(e) => handleCardTitleChange(cardId, e.currentTarget.value)}
                      onclick={(e) => e.stopPropagation()}
                    />
                  </div>
                  {/if}
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

            <!-- Column drop indicator after -->
            {#if columnDragPreview && columnDragPreview.targetColIndex === colIndex && !columnDragPreview.insertBefore}
              <div
                class="column-drop-indicator"
                style="min-width: {THUMBNAIL_SIZES[selectedThumbnailSize].width}px;"
                ondragover={(e) => { e.preventDefault(); handleColumnDragOver(e, colId); }}
                ondrop={(e) => { console.log('[drop indicator after ondrop]'); handleColumnDrop(e, colId); }}
              ></div>
            {/if}
          </div>
        {/each}
      </div>
      {/if}

      <!-- Scrollable columns area -->
      <div
        bind:this={columnsContainerRef}
        class="columns-container"
        style="gap: {THUMBNAIL_SIZES[selectedThumbnailSize].width * 0.05}px"
        onscroll={syncColumnsScroll}
      >
        {#each displayCols as colId, colIndex (colId)}
          <div class="column-wrapper" animate:flip={{ duration: 300 }}>
            <!-- Column drop indicator before -->
            {#if columnDragPreview && columnDragPreview.targetColIndex === colIndex && columnDragPreview.insertBefore}
              <div
                class="column-drop-indicator"
                style="min-width: {THUMBNAIL_SIZES[selectedThumbnailSize].width}px;"
                ondragover={(e) => { e.preventDefault(); handleColumnDragOver(e, colId); }}
                ondrop={(e) => { console.log('[drop indicator ondrop]'); handleColumnDrop(e, colId); }}
              ></div>
            {/if}

            <div
              class="column {draggedColumn === colId ? 'column-dragging' : ''}"
              style="width: {THUMBNAIL_SIZES[selectedThumbnailSize].width}px; gap: {THUMBNAIL_SIZES[selectedThumbnailSize].width * 0.035}px"
              ondragover={(e) => {
                console.log('[column ondragover] colId:', colId, 'isColumnDragging:', isColumnDragging);
                handleColumnDragOver(e, colId);
              }}
              ondrop={(e) => {
                console.log('[column ondrop] colId:', colId, 'isColumnDragging:', isColumnDragging);
                handleColumnDrop(e, colId);
              }}
            >
            <!-- Get all cards in this lane (skip first time if sticky) -->
            {#each (stickyTopRow ? displayRows.slice(1) : displayRows) as rowId (rowId)}
              {@const key = cellKey(rowId, colId)}
              {@const cell = cellsMap.get(key)}
              {@const cardId = cell?.cardId}
              {@const card = cardId ? cardsMetadata.get(cardId) : null}
              {@const isFirstRow = rowId === rows[0]}

              <!-- Show shot header if this is first row and sticky is disabled -->
              {#if !stickyTopRow && isFirstRow && !colId.startsWith('phantom-')}
                <div class="shot-header-title">
                  <input
                    type="text"
                    class="shot-title-input"
                    value={shotTitles.get(colId) || `Shot ${colId.replace('c-', '').replace('media', '1').replace('alt', '2').replace('notes', '3')}`}
                    placeholder="Shot title"
                    onchange={(e) => handleShotTitleChange(colId, e.currentTarget.value)}
                  />
                  <div class="shot-header-menu">
                    <button class="icon-btn-header menu-btn" title="Column options" onclick={(e) => toggleColumnMenu(colId, e)}>
                      <span class="material-symbols-outlined">more_vert</span>
                    </button>

                    {#if openColumnMenu === colId}
                      <div class="column-dropdown-menu" onclick={(e) => e.stopPropagation()}>
                        <button class="menu-item" onclick={() => { duplicateColumn(colId); closeColumnMenu(); }}>
                          <span class="material-symbols-outlined">content_copy</span>
                          <span>Duplicate</span>
                        </button>
                        <button class="menu-item" onclick={closeColumnMenu}>
                          <span class="material-symbols-outlined">comment</span>
                          <span>Comment</span>
                        </button>
                        <button class="menu-item" onclick={() => { handleColumnDownload(colId); closeColumnMenu(); }}>
                          <span class="material-symbols-outlined">file_download</span>
                          <span>Download</span>
                        </button>
                        <button class="menu-item delete-item" onclick={() => { deleteColumn(colId); closeColumnMenu(); }}>
                          <span class="material-symbols-outlined">delete</span>
                          <span>Delete</span>
                        </button>
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}

              <!-- Show placeholder before card if drag preview indicates it -->
              {#if dragPreview && dragPreview.targetLane === colId && dragPreview.targetTime === rowId && dragPreview.insertBefore}
                <div
                  class="drag-placeholder"
                  style="width: {THUMBNAIL_SIZES[selectedThumbnailSize].width}px; height: {THUMBNAIL_SIZES[selectedThumbnailSize].height}px"
                  ondrop={(e) => {
                    if (isColumnDragging) return;
                    handleDrop(e, rowId, colId);
                  }}
                  ondragover={(e) => e.preventDefault()}
                ></div>
              {/if}

              {#if card}
                <div
                  class="shot-card {isDragging && draggedCard?.cardId === cardId ? 'dragging' : ''} {!stickyTopRow && isFirstRow ? 'column-drag-handle' : ''}"
                  style="background-color: {card.thumb_url ? 'rgba(0, 0, 0, 0.3)' : card.color}; width: {THUMBNAIL_SIZES[selectedThumbnailSize].width}px; height: {THUMBNAIL_SIZES[selectedThumbnailSize].height}px"
                  draggable="true"
                  ondragstart={(e) => !stickyTopRow && isFirstRow ? handleColumnDragStart(e, colId) : handleDragStart(e, rowId, colId, cardId)}
                  ondragover={(e) => {
                    console.log('[card ondragover] rowId:', rowId, 'colId:', colId, 'isColumnDragging:', isColumnDragging);
                    // If dragging a column, prevent default but let it bubble to column container
                    if (isColumnDragging) {
                      e.preventDefault();
                      console.log('[card ondragover] Returning early for column drag');
                      return;
                    }
                    (!stickyTopRow && isFirstRow ? handleColumnDragOver(e, colId) : handleDragOver(e, rowId, colId, e.currentTarget));
                  }}
                  ondrop={(e) => {
                    console.log('[card ondrop] rowId:', rowId, 'colId:', colId, 'isColumnDragging:', isColumnDragging);
                    // If dragging a column, let it bubble to column container; otherwise handle card drop
                    if (isColumnDragging) {
                      console.log('[card ondrop] Returning early for column drag');
                      return;
                    }
                    (!stickyTopRow && isFirstRow ? handleColumnDrop(e, colId) : handleDrop(e, rowId, colId));
                  }}
                  ondragend={(e) => !stickyTopRow && isFirstRow ? resetColumnDrag() : handleDragEnd(e)}
                  ondblclick={() => handleCardDoubleClick(cardId)}
                >
                  {#if card.isLoading}
                    <!-- Loading spinner -->
                    <div class="upload-loading">
                      <div class="loading-spinner"></div>
                    </div>
                  {:else if card.media_type === 'video' && card.media_url && card.thumb_url}
                    <div ondragstart={(e) => e.preventDefault()}>
                      <VideoMedia src={card.media_url} thumbnail={card.thumb_url} />
                    </div>
                  {:else if card.thumb_url}
                    <img
                      src={card.thumb_url}
                      alt={card.title}
                      class="card-thumbnail"
                      loading="lazy"
                      decoding="async"
                      ondragstart={(e) => e.preventDefault()}
                    />
                  {/if}
                  {#if !card.thumb_url && !card.media_url && !card.isLoading}
                  <div class="card-title-container">
                    <input
                      type="text"
                      class="shot-title-input card-title-input"
                      value={card.number ? `${card.title} ${card.number}` : card.title}
                      oninput={(e) => handleCardTitleInput(cardId, e.currentTarget.value)}
                      onchange={(e) => handleCardTitleChange(cardId, e.currentTarget.value)}
                      onclick={(e) => e.stopPropagation()}
                    />
                  </div>
                  {/if}
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
              {:else}
                <!-- Blank cell with upload/generate icons on hover -->

                <div
                  class="blank-cell"
                  style="width: {THUMBNAIL_SIZES[selectedThumbnailSize].width}px; height: {THUMBNAIL_SIZES[selectedThumbnailSize].height}px"
                  ondragover={(e) => {
                    // If dragging a column, prevent default but let it bubble
                    if (isColumnDragging) {
                      e.preventDefault();
                      return;
                    }
                    handleDragOver(e, rowId, colId, e.currentTarget);
                  }}
                  ondrop={(e) => {
                    // If dragging a column, let it bubble to column container
                    if (isColumnDragging) return;
                    handleDrop(e, rowId, colId);
                  }}
                >
                  <input
                    type="file"
                    id="upload-{rowId}-{colId}"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
                    style="display: none"
                    onchange={(e) => handleFileUpload(e, rowId, colId)}
                  />
                  <button
                    class="cell-action-btn upload-btn"
                    title="Upload media"
                    onclick={() => document.getElementById(`upload-${rowId}-${colId}`)?.click()}
                  >
                    <span class="material-symbols-outlined">upload</span>
                  </button>
                  <button
                    class="cell-action-btn generate-btn"
                    title="Generate (coming soon)"
                    disabled
                  >
                    <span class="material-symbols-outlined">add</span>
                  </button>
                </div>
              {/if}

              <!-- Show placeholder after card if drag preview indicates it -->
              {#if dragPreview && dragPreview.targetLane === colId && dragPreview.targetTime === rowId && !dragPreview.insertBefore}
                <div
                  class="drag-placeholder"
                  style="width: {THUMBNAIL_SIZES[selectedThumbnailSize].width}px; height: {THUMBNAIL_SIZES[selectedThumbnailSize].height}px"
                  ondrop={(e) => {
                    if (isColumnDragging) return;
                    handleDrop(e, rowId, colId);
                  }}
                  ondragover={(e) => e.preventDefault()}
                ></div>
              {/if}
            {/each}
          </div>

            <!-- Column drop indicator after -->
            {#if columnDragPreview && columnDragPreview.targetColIndex === colIndex && !columnDragPreview.insertBefore}
              <div
                class="column-drop-indicator"
                style="min-width: {THUMBNAIL_SIZES[selectedThumbnailSize].width}px;"
                ondragover={(e) => { e.preventDefault(); handleColumnDragOver(e, colId); }}
                ondrop={(e) => { console.log('[scrollable drop indicator after ondrop]'); handleColumnDrop(e, colId); }}
              ></div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Modal Overlay (inside content area) -->
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
            {#if modalMediaType === 'video' && modalMediaUrl && modalThumbUrl}
              <VideoMedia src={modalMediaUrl} thumbnail={modalThumbUrl} />
            {:else if modalMediaUrl}
              <img
                src={modalMediaUrl}
                alt={modalTitle}
                class="modal-media-image"
                loading="eager"
              />
            {/if}
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
              <div class="prompt-header">
                <label class="modal-label">Prompt</label>
                <button class="format-json-btn" title="Format as JSON" onclick={formatPromptAsJSON}>
                  <span class="material-symbols-outlined">data_object</span>
                </button>
              </div>
              <textarea
                bind:this={promptTextRef}
                class="modal-textarea"
                value={modalPrompt}
                placeholder="Add a rowing oar"
                rows="8"
              ></textarea>
            </div>

            <div class="modal-field">
              <label class="modal-label">Attachments</label>
              <div class="attachments-gallery">
                <!-- Upload button -->
                <label class="attachment-upload-btn" title="Upload image or video">
                  <span class="material-symbols-outlined">add_photo_alternate</span>
                  <input type="file" accept="image/*,video/mp4,video/quicktime,video/webm" style="display: none;" onchange={handleAttachmentUpload} />
                </label>

                <!-- Attachment thumbnails -->
                {#each attachments as attachment}
                  <div class="attachment-thumbnail">
                    <img src={attachment.thumbnailUrl} alt={attachment.name} />
                    <button
                      class="attachment-delete-btn"
                      title="Delete attachment"
                      onclick={() => deleteAttachment(attachment.id)}
                    >
                      ×
                    </button>
                  </div>
                {/each}
              </div>
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

  <!-- Confirmation Dialog -->
  {#if showConfirmDialog}
    <div class="confirm-overlay" onclick={handleCancelConfirm}>
      <div class="confirm-dialog" onclick={(e) => e.stopPropagation()}>
        <div class="confirm-message">{confirmMessage}</div>
        <div class="confirm-buttons">
          <button class="confirm-btn confirm-btn-cancel" onclick={handleCancelConfirm}>
            Cancel
          </button>
          <button class="confirm-btn confirm-btn-delete" onclick={handleConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Toast Notification -->
  {#if showToast}
    <div class="toast-overlay">
      <div class="toast">
        {toastMessage}
      </div>
    </div>
  {/if}

    </main>
  </div>
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
    position: relative;
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
    right: 8px;
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
    padding-bottom: 2.5rem;
    border-bottom: 2px solid rgba(255, 255, 255, 0.15);
    margin-bottom: 2.5rem;
    overflow-x: auto;
    overflow-y: visible;
    scrollbar-width: none; /* Firefox */
    -ms-overflow-style: none; /* IE/Edge */
  }

  .frozen-row::-webkit-scrollbar {
    display: none; /* Chrome/Safari/Opera */
  }

  .shot-column {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    transition: opacity 0.2s ease, transform 0.2s ease;
    flex-shrink: 0;
    box-sizing: border-box;
  }

  .shot-column.column-dragging {
    opacity: 0.5;
  }

  /* Ghost the frozen row card being dragged */
  .shot-column.column-dragging .shot-card {
    opacity: 0.7;
    transform: scale(0.98);
    transition: opacity 0.2s ease, transform 0.2s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .column.column-dragging {
    opacity: 0.5;
  }

  /* Ghost all cards in the dragged column */
  .column.column-dragging .shot-card {
    opacity: 0.7;
    transform: scale(0.98);
    transition: opacity 0.2s ease, transform 0.2s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .column-drop-indicator {
    min-width: var(--column-width, 320px);
    background: rgba(100, 150, 255, 0.08);
    border: 2px solid rgba(100, 150, 255, 0.4);
    border-radius: 8px;
    box-shadow: 0 0 0 1px rgba(100, 150, 255, 0.2), 0 4px 16px rgba(100, 150, 255, 0.2);
    align-self: stretch;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 0.6;
    }
    50% {
      opacity: 1;
    }
  }

  .column-wrapper {
    display: contents;
  }

  .shot-header-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    gap: 0.5rem;
    width: 100%;
    max-width: 100%;
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

  .card-title-container {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    width: 100%;
  }

  .card-number {
    font-size: 0.7rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.6);
    flex-shrink: 0;
    min-width: 1.5rem;
    text-align: right;
  }

  .shot-header-menu {
    position: relative;
    display: flex;
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

  .column-dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    background: rgba(20, 20, 20, 0.98);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    min-width: 160px;
    padding: 4px;
    z-index: 1000;
    backdrop-filter: blur(10px);
  }

  .column-dropdown-menu .menu-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.9);
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
    font-size: 14px;
  }

  .column-dropdown-menu .menu-item:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .column-dropdown-menu .menu-item .material-symbols-outlined {
    font-size: 18px;
    color: rgba(255, 255, 255, 0.7);
  }

  .column-dropdown-menu .menu-item span:last-child {
    flex: 1;
  }

  .column-dropdown-menu .menu-item.delete-item {
    color: rgba(255, 100, 100, 0.9);
  }

  .column-dropdown-menu .menu-item.delete-item:hover {
    background: rgba(255, 100, 100, 0.15);
    color: rgba(255, 120, 120, 1);
  }

  .column-dropdown-menu .menu-item.delete-item .material-symbols-outlined {
    color: rgba(255, 100, 100, 0.8);
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

  .menu-checkbox {
    display: inline-block;
    width: 1.2em;
    margin-right: 0.5em;
    text-align: center;
    color: rgba(255, 255, 255, 0.9);
  }

  /* Columns Container */
  .columns-container {
    display: flex;
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
    transition: opacity 0.2s ease, transform 0.2s ease;
    flex-shrink: 0;
    box-sizing: border-box;
  }

  /* Shot Card (Image placeholder) */
  .shot-card {
    position: relative;
    border-radius: 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    cursor: grab;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-sizing: border-box;
    flex-shrink: 0;
  }

  /* Prevent child elements from interfering with card drag */
  .shot-card > * {
    pointer-events: none;
  }

  /* Re-enable pointer events for interactive elements */
  .shot-card .btn-delete,
  .shot-card .card-title-input {
    pointer-events: auto;
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
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 4px;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
    box-sizing: border-box;
    flex-shrink: 0;
    animation: placeholder-appear 0.2s ease-out;
  }

  @keyframes placeholder-appear {
    from {
      opacity: 0;
      transform: scaleY(0.5);
    }
    to {
      opacity: 1;
      transform: scaleY(1);
    }
  }

  /* Blank cell styles */
  .blank-cell {
    position: relative;
    border-radius: 0;
    border: 1px dashed rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.02);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    flex-shrink: 0;
    box-sizing: border-box;
  }

  .blank-cell:hover {
    border-color: rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.04);
  }

  .cell-action-btn {
    width: 48px;
    height: 48px;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
    opacity: 0;
  }

  .blank-cell:hover .cell-action-btn {
    opacity: 1;
  }

  .cell-action-btn:hover:not(:disabled) {
    color: rgba(255, 255, 255, 0.9);
    transform: scale(1.15);
  }

  .cell-action-btn:disabled {
    cursor: not-allowed;
  }

  .blank-cell:hover .cell-action-btn:disabled {
    opacity: 0.3;
  }

  .cell-action-btn .material-symbols-outlined {
    font-size: 28px;
  }

  /* Card thumbnail */
  .card-thumbnail {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: center;
    z-index: 0;
    background: rgba(0, 0, 0, 0.1);
  }

  .card-title-container {
    position: relative;
    z-index: 1;
    padding: 8px;
    width: 100%;
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
    position: absolute;
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
    width: 100%;
    border-radius: 8px;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    aspect-ratio: 16 / 9;
  }

  .modal-media-image {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: center;
    z-index: 0;
  }

  .sketch-canvas {
    position: relative;
    width: 100%;
    height: 100%;
    object-fit: contain;
    cursor: crosshair;
    border-radius: 8px;
    z-index: 1;
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
    justify-content: flex-end;
    align-items: center;
    margin-bottom: 0.5rem;
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

  .prompt-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .format-json-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    transition: all 0.15s;
  }

  .format-json-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.25);
    color: rgba(255, 255, 255, 0.8);
  }

  .format-json-btn .material-symbols-outlined {
    font-size: 18px;
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
    font-size: 0.875rem;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
    line-height: 1.5;
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

  .attachments-gallery {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.5rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    min-height: 80px;
  }

  .attachment-upload-btn {
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.05);
    border: 1px dashed rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
    color: rgba(255, 255, 255, 0.4);
  }

  .attachment-upload-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.3);
    color: rgba(255, 255, 255, 0.6);
  }

  .attachment-upload-btn .material-symbols-outlined {
    font-size: 24px;
  }

  .attachment-thumbnail {
    position: relative;
    width: 64px;
    height: 64px;
    border-radius: 6px;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.15);
  }

  .attachment-thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .attachment-delete-btn {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 20px;
    height: 20px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.7);
    border: none;
    border-radius: 50%;
    color: rgba(255, 255, 255, 0.9);
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .attachment-thumbnail:hover .attachment-delete-btn {
    opacity: 1;
  }

  .attachment-delete-btn:hover {
    background: rgba(255, 50, 50, 0.9);
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

  /* Confirmation Dialog */
  .confirm-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 20000;
    animation: fadeIn 0.2s ease;
  }

  .confirm-dialog {
    background: rgba(20, 20, 20, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 12px;
    padding: 1.5rem;
    max-width: 400px;
    width: 90%;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    animation: slideUp 0.2s ease;
  }

  .confirm-message {
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.95rem;
    line-height: 1.5;
    margin-bottom: 1.5rem;
    white-space: pre-line;
  }

  .confirm-buttons {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }

  .confirm-btn {
    padding: 0.6rem 1.25rem;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
  }

  .confirm-btn-cancel {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.85);
  }

  .confirm-btn-cancel:hover {
    background: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.95);
  }

  .confirm-btn-delete {
    background: rgba(239, 68, 68, 0.9);
    color: white;
  }

  .confirm-btn-delete:hover {
    background: rgba(239, 68, 68, 1);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
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

  /* Toast Notification */
  .toast-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 30000;
    animation: fadeIn 0.2s ease;
    pointer-events: none;
  }

  .toast {
    background: rgba(30, 30, 30, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 12px;
    padding: 1.5rem 2.5rem;
    color: rgba(255, 255, 255, 0.95);
    font-size: 1rem;
    font-weight: 500;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(12px);
    animation: slideUpToast 0.3s ease;
    min-width: 200px;
    text-align: center;
  }

  @keyframes slideUpToast {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
  /* Upload loading state */
  .upload-loading {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    z-index: 10;
  }

  .loading-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-top: 2px solid white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
</style>
