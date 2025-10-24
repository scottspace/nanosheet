<script lang="ts">
  import { onMount } from 'svelte'
  import { SheetState, THUMBNAIL_SIZES } from '../lib/sheet/SheetState.svelte.ts'
  import { DragOperations } from '../lib/sheet/operations/DragOperations'
  import { ColumnDragOperations } from '../lib/sheet/operations/ColumnDragOperations'
  import { UndoRedoOperations } from '../lib/sheet/operations/UndoRedoOperations'
  import { ColumnOperations } from '../lib/sheet/operations/ColumnOperations'
  import { CardOperations } from '../lib/sheet/operations/CardOperations'
  import { AppLayout } from '$lib/app'
  import type { Level } from '$lib/app'
  import SheetGrid from '../lib/components/SheetGrid.svelte'
  import CardModal from '../lib/components/CardModal.svelte'
  import ToastNotification from '../lib/components/ToastNotification.svelte'
  import ConfirmDialog from '../lib/components/ConfirmDialog.svelte'
  import CardContextMenu from '../lib/components/CardContextMenu.svelte'
  import { connectSheet, getAllCardIds, setCard, cardMapToObject } from '../lib/ySheet'
  import * as Y from 'yjs'

  // ============================================================================
  // CENTRALIZED STATE
  // ============================================================================

  const state = new SheetState()

  // ============================================================================
  // HELPER: TOAST NOTIFICATION
  // ============================================================================

  function showToast(message: string) {
    state.toastMessage = message
    state.showToast = true
    if (state.toastTimeout) clearTimeout(state.toastTimeout)
    state.toastTimeout = setTimeout(() => {
      state.showToast = false
    }, 3000)
  }

  function showConfirm(message: string, callback: () => void) {
    state.confirmMessage = message
    state.confirmCallback = callback
    state.showConfirmDialog = true
  }

  // ============================================================================
  // OPERATIONS CLASSES
  // ============================================================================

  // Drag state object that operations will mutate
  const dragState = {
    get draggedCard() { return state.draggedCard },
    set draggedCard(value) { state.draggedCard = value },
    get dragPreview() { return state.dragPreview },
    set dragPreview(value) { state.dragPreview = value },
    get isDragging() { return state.isDragging },
    set isDragging(value) { state.isDragging = value },
    get dragMousePos() { return state.dragMousePos },
    set dragMousePos(value) { state.dragMousePos = value }
  }

  const dragOps = new DragOperations(
    state.orientation,
    dragState,
    {
      onRecordUndo: (op) => state.undoStack.push(op),
      onClearRedo: () => { state.redoStack = [] }
    },
    state.userId,
    () => state.sheet,
    () => state.timeline
  )

  // Column drag state object
  const columnDragState = {
    get draggedColumn() { return state.draggedColumn },
    set draggedColumn(value) { state.draggedColumn = value },
    get columnDragPreview() { return state.columnDragPreview },
    set columnDragPreview(value) { state.columnDragPreview = value },
    get isColumnDragging() { return state.isColumnDragging },
    set isColumnDragging(value) { state.isColumnDragging = value }
  }

  const columnDragOps = new ColumnDragOperations(
    state.orientation,
    columnDragState,
    {
      onRecordUndo: (op) => state.undoStack.push(op),
      onClearRedo: () => { state.redoStack = [] }
    },
    state.userId,
    () => state.sheet,
    () => state.lanes,
    () => state.timeline,
    () => state.cellsMap,
    () => state.cardsMetadata,
    () => state.thumbnailSize
  )

  // Undo/redo state object
  const undoRedoState = {
    get undoStack() { return state.undoStack },
    set undoStack(value) { state.undoStack = value },
    get redoStack() { return state.redoStack },
    set redoStack(value) { state.redoStack = value }
  }

  let undoRedoOps: UndoRedoOperations | null = null

  // Column menu state object
  const columnMenuState = {
    get openColumnMenu() { return state.openColumnMenu },
    set openColumnMenu(value) { state.openColumnMenu = value }
  }

  let columnOps: ColumnOperations | null = null

  // Card modal state object
  const cardModalState = {
    get showModal() { return state.showModal },
    set showModal(value) { state.showModal = value },
    get modalCardId() { return state.modalCardId },
    set modalCardId(value) { state.modalCardId = value },
    get modalMediaId() { return state.modalMediaId },
    set modalMediaId(value) { state.modalMediaId = value },
    get modalTitle() { return state.modalTitle },
    set modalTitle(value) { state.modalTitle = value },
    get modalColor() { return state.modalColor },
    set modalColor(value) { state.modalColor = value },
    get modalPrompt() { return state.modalPrompt },
    set modalPrompt(value) { state.modalPrompt = value },
    get modalMediaUrl() { return state.modalMediaUrl },
    set modalMediaUrl(value) { state.modalMediaUrl = value },
    get modalMediaType() { return state.modalMediaType },
    set modalMediaType(value) { state.modalMediaType = value },
    get modalThumbUrl() { return state.modalThumbUrl },
    set modalThumbUrl(value) { state.modalThumbUrl = value },
    get attachments() { return state.attachments },
    set attachments(value) { state.attachments = value }
  }

  let cardOps: CardOperations | null = null

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  // Debounce card metadata fetching to prevent excessive API calls during drag operations
  let fetchMetadataTimeout: number | null = null
  const FETCH_METADATA_DEBOUNCE = 300 // ms

  // Batch Yjs updates to prevent excessive reactivity during Kanban shifting
  let updateFromYjsTimeout: number | null = null
  const UPDATE_FROM_YJS_DEBOUNCE = 16 // ~60fps

  function updateFromYjs() {
    if (!state.sheet) return

    state.rows = state.sheet.rowOrder.toArray()
    state.cols = state.sheet.colOrder.toArray()
    state.cellsMap = new Map(state.sheet.cells)
    // Note: cardsMetadata updated granularly by observer, not in batch
    state.shotTitles = new Map(state.sheet.shotTitles)
  }

  function scheduleUpdateFromYjs() {
    if (updateFromYjsTimeout) {
      clearTimeout(updateFromYjsTimeout)
    }
    updateFromYjsTimeout = setTimeout(updateFromYjs, UPDATE_FROM_YJS_DEBOUNCE)
  }

  // Helper: Convert nested Y.Map structure to plain Map for local state
  // Also handles legacy plain objects for backward compatibility
  function convertCardsMetadataToMap(cardsMetadata: Y.Map<any>): Map<string, any> {
    const result = new Map<string, any>()
    cardsMetadata.forEach((cardData, cardId) => {
      // Handle both nested Y.Maps (new format) and plain objects (legacy format)
      if (cardData instanceof Y.Map) {
        result.set(cardId, {
          id: cardId,
          ...cardMapToObject(cardData)
        })
      } else {
        // Legacy plain object
        result.set(cardId, {
          id: cardId,
          ...cardData
        })
      }
    })
    return result
  }

  onMount(async () => {
    // Set environment URLs
    state.wsUrl = import.meta.env.VITE_YWS || 'ws://localhost:8000/yjs'
    state.apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

    // Initialize operations that need API URL
    undoRedoOps = new UndoRedoOperations(
      state.orientation,
      undoRedoState,
      state.userId,
      state.apiUrl,
      () => state.sheet,
      () => state.timeline,
      () => state.cardsMetadata,
      () => 'vertical'
    )

    columnOps = new ColumnOperations(
      state.orientation,
      columnMenuState,
      {
        showConfirm,
        onRecordUndo: (op) => state.undoStack.push(op),
        onClearRedo: () => { state.redoStack = [] },
        showToast
      },
      state.userId,
      state.apiUrl,
      () => state.sheet,
      () => state.cols,
      () => state.timeline,
      () => state.cellsMap,
      () => state.cardsMetadata,
      () => state.shotTitles,
      () => 'vertical'
    )

    cardOps = new CardOperations(
      state.orientation,
      cardModalState,
      {
        showConfirm,
        showToast,
        onRecordUndo: (op) => state.undoStack.push(op),
        onClearRedo: () => { state.redoStack = [] },
        onDeleteColumn: (colId) => columnOps?.deleteColumn(colId)
      },
      state.userId,
      state.apiUrl,
      () => state.sheet,
      () => state.timeline,
      () => state.cellsMap,
      () => state.cardsMetadata,
      () => 'vertical'
    )

    // Load user preferences
    state.loadPreferences()

    // Connect to Yjs
    try {
      state.sheet = await connectSheet(state.wsUrl, state.sheetId, state.userId)

      // Verify connection was successful
      if (!state.sheet || !state.sheet.rowOrder) {
        throw new Error('Failed to establish valid Yjs connection')
      }

      // Subscribe to Yjs updates - batched for performance
      state.sheet.rowOrder.observe(() => scheduleUpdateFromYjs())
      state.sheet.colOrder.observe(() => scheduleUpdateFromYjs())

      state.sheet.cells.observe(() => {
        scheduleUpdateFromYjs()

        // Debounce metadata fetching to prevent excessive API calls during drag operations
        if (fetchMetadataTimeout) {
          clearTimeout(fetchMetadataTimeout)
        }

        fetchMetadataTimeout = setTimeout(async () => {
          const cardIds = getAllCardIds(state.sheet!)
          const missingCardIds = cardIds.filter(id => !state.cardsMetadata.has(id))

          if (missingCardIds.length > 0) {
            try {
              const response = await fetch(`${state.apiUrl}/api/cards/batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cardIds: missingCardIds })
              })

              if (response.ok) {
                const cards = await response.json()
                console.log('[+page.svelte] Fetched cards from API:', cards.length, cards[0])

                // Store in Yjs using nested Y.Maps (new format) - batched in transaction
                if (state.sheet) {
                  state.sheet.doc.transact(() => {
                    for (const card of cards) {
                      // Set all card fields including id for compatibility
                      setCard(state.sheet!, card.cardId, {
                        ...card,
                        id: card.cardId // Ensure id field is set
                      })
                    }
                  })
                  console.log('[+page.svelte] Stored', cards.length, 'cards in Yjs cardsMetadata (batched)')
                  console.log('[+page.svelte] cardsMetadata size:', state.sheet.cardsMetadata.size)
                }
              }
            } catch (error) {
              console.error('Failed to fetch card metadata:', error)
            }
          }
        }, FETCH_METADATA_DEBOUNCE)
      })

      // Helper function to observe a card's Y.Map for field changes
      const observeCardMap = (cardId: string, cardMap: Y.Map<any>) => {
        cardMap.observeDeep(() => {
          if (!state.sheet) return
          const updatedCardObj = {
            id: cardId,
            ...cardMapToObject(cardMap)
          }
          const updatedMetadata = new Map(state.cardsMetadata)
          updatedMetadata.set(cardId, updatedCardObj)
          state.cardsMetadata = updatedMetadata
        })
      }

      // Observe cardsMetadata for granular updates (only update changed cards)
      state.sheet.cardsMetadata.observe((event) => {
        if (!state.sheet) return

        const newMetadata = new Map(state.cardsMetadata)
        let hasChanges = false

        event.changes.keys.forEach((change, cardId) => {
          if (change.action === 'delete') {
            // Card deleted
            newMetadata.delete(cardId)
            hasChanges = true
          } else if (change.action === 'add' || change.action === 'update') {
            // Card added or updated - handle both Y.Map (new) and plain object (legacy)
            const cardData = state.sheet!.cardsMetadata.get(cardId)
            if (cardData) {
              if (cardData instanceof Y.Map) {
                // New nested Y.Map format
                const cardObj = {
                  id: cardId,
                  ...cardMapToObject(cardData)
                }
                newMetadata.set(cardId, cardObj)

                // Observe the nested Y.Map for field changes
                observeCardMap(cardId, cardData)
              } else {
                // Legacy plain object format
                newMetadata.set(cardId, {
                  id: cardId,
                  ...cardData
                })
              }
              hasChanges = true
            }
          }
        })

        if (hasChanges) {
          state.cardsMetadata = newMetadata
        }
      })

      // Also observe all existing cards on initial load
      state.sheet.cardsMetadata.forEach((cardData, cardId) => {
        if (cardData instanceof Y.Map) {
          observeCardMap(cardId, cardData)
        }
      })

      state.sheet.shotTitles.observe(() => scheduleUpdateFromYjs())

      // Initialize state from Yjs
      state.rows = state.sheet.rowOrder.toArray()
      state.cols = state.sheet.colOrder.toArray()
      state.cellsMap = new Map(state.sheet.cells)
      state.cardsMetadata = convertCardsMetadataToMap(state.sheet.cardsMetadata)
      state.shotTitles = new Map(state.sheet.shotTitles)
      state.loading = false

      return () => {
        state.sheet?.provider.disconnect()
      }
    } catch (error) {
      console.error('Failed to connect to sheet:', error)
      state.loading = false
      showToast('Failed to connect to Yjs server. Make sure the backend is running.')
    }
  })

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  function handleUndo() {
    undoRedoOps?.handleUndo()
  }

  function handleRedo() {
    undoRedoOps?.handleRedo()
  }

  async function handleRegenerate() {
    try {
      // Backend handles all the clearing and repopulating atomically
      // Don't clear anything on the frontend - just let Yjs sync handle it
      const response = await fetch(`${state.apiUrl}/api/sheets/${state.sheetId}/regenerate`, {
        method: 'POST'
      })

      if (!response.ok) {
        throw new Error(`Regenerate failed: ${response.statusText}`)
      }

      const result = await response.json()
      console.log('[handleRegenerate] Sheet regenerated:', result)
      showToast('Sheet regenerated successfully')
    } catch (error) {
      console.error('[handleRegenerate] Failed to regenerate sheet:', error)
      showToast('Failed to regenerate sheet')
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      handleUndo()
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
      e.preventDefault()
      handleRedo()
    } else if (e.key === 'Escape') {
      if (state.isDragging || state.isColumnDragging) {
        dragOps.handleDragEnd(new DragEvent('dragend'))
        columnDragOps.resetColumnDrag()
      }
      if (state.showThumbnailMenu) state.showThumbnailMenu = false
      if (state.openColumnMenu) state.openColumnMenu = null
      if (state.openEllipsisMenu) state.openEllipsisMenu = null
    }
  }

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement
    if (state.showThumbnailMenu && !target.closest('.thumbnail-dropdown')) {
      state.showThumbnailMenu = false
    }
    if (state.openEllipsisMenu && !target.closest('.ellipsis-menu-container')) {
      state.openEllipsisMenu = null
    }
    if (state.openColumnMenu && !target.closest('.column-menu') && !target.closest('.menu-btn')) {
      state.openColumnMenu = null
    }
  }

  function handleSyncColumnsScroll(e: Event) {
    const target = e.target as HTMLElement
    if (state.columnsContainerRef && target !== state.columnsContainerRef) {
      state.columnsContainerRef.scrollLeft = target.scrollLeft
    }
    if (state.frozenRowRef && target !== state.frozenRowRef) {
      state.frozenRowRef.scrollLeft = target.scrollLeft
    }
  }

  function handleSyncRowsScroll(e: Event) {
    const target = e.target as HTMLElement
    if (state.rowsContainerRef && target !== state.rowsContainerRef) {
      state.rowsContainerRef.scrollTop = target.scrollTop
    }
    if (state.frozenColumnRef && target !== state.frozenColumnRef) {
      state.frozenColumnRef.scrollTop = target.scrollTop
    }
  }

  function handleShotTitleChange(colId: string, value: string) {
    if (state.sheet && !colId.startsWith('phantom-')) {
      state.sheet.shotTitles.set(colId, value)
    }
  }

  // ============================================================================
  // CARD CONTEXT MENU HANDLERS
  // ============================================================================

  function handleCardContextMenu(e: MouseEvent, cardId: string) {
    state.openCardMenu = cardId
    state.cardMenuPosition = { x: e.clientX, y: e.clientY }
  }

  async function handleFileUpload(e: Event, rowId: string, colId: string) {
    const input = e.target as HTMLInputElement
    const files = input.files
    if (!files || files.length === 0) return

    // Convert FileList to Array and sort alphabetically by name
    const filesArray = Array.from(files).sort((a, b) => a.name.localeCompare(b.name))
    const totalFiles = filesArray.length

    // Show toast with progress bar
    state.toastMessage = `Uploading`
    state.toastProgress = 0
    state.toastCurrent = 0
    state.toastTotal = totalFiles
    state.showToast = true
    if (state.toastTimeout) clearTimeout(state.toastTimeout)

    // Backend will insert cards at the front of the lane (position 1+)
    // Each card gets an insert_index to maintain alphabetical order
    const cardInfos: Array<{ cardId: string; file: File; laneId: string; insertIndex: number }> = []

    for (let i = 0; i < filesArray.length; i++) {
      const file = filesArray[i]
      const cardId = `card-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 9)}`

      console.log(`[handleFileUpload] File ${i} (${file.name}) -> cardId=${cardId}, laneId=${colId}, insertIndex=${i}`)

      // Backend will insert at position (1 + i), shifting existing cards down
      cardInfos.push({ cardId, file, laneId: colId, insertIndex: i })
    }

    // Scroll to show the first uploaded card (position 1 in the lane)
    // Wait for backend to create placeholders and DOM to update
    if (cardInfos.length > 0 && state.timeline.length > 1) {
      const firstDataRow = state.timeline[1] // Position 1 (after frozen header)
      const laneId = colId

      console.log('[handleFileUpload] Will scroll to:', firstDataRow, laneId)

      // Try multiple times with increasing delays to catch the DOM update
      const tryScroll = (attempts = 0) => {
        const cellElement = document.querySelector(`[data-row="${firstDataRow}"][data-col="${laneId}"]`)
        console.log('[handleFileUpload] Scroll attempt', attempts, '- found element:', !!cellElement)

        if (cellElement) {
          cellElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'center'
          })
          console.log('[handleFileUpload] Scrolled to uploaded card')
        } else if (attempts < 5) {
          // Try again with exponential backoff
          setTimeout(() => tryScroll(attempts + 1), 100 * Math.pow(2, attempts))
        } else {
          console.warn('[handleFileUpload] Failed to find card element after 5 attempts')
        }
      }

      tryScroll()
    }

    // Upload all files in parallel
    let completedCount = 0
    const uploadPromises = cardInfos.map(async ({ cardId, file, laneId, insertIndex }) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('sheet_id', state.sheetId)
      formData.append('card_id', cardId)
      formData.append('lane_id', laneId)
      formData.append('insert_index', insertIndex.toString())
      formData.append('title', file.name)

      try {
        // Use the new atomic upload-card endpoint
        // Backend handles: media upload + Datastore + Yjs + cell assignment
        const response = await fetch(`${state.apiUrl}/api/media/upload-card`, {
          method: 'POST',
          body: formData
        })

        if (!response.ok) throw new Error('Upload failed')

        const result = await response.json()

        // Backend handles everything:
        // 1. Created loading placeholder in Yjs (user saw spinner immediately)
        // 2. Uploaded media to GCS
        // 3. Saved to Datastore
        // 4. Updated Yjs with final data (isLoading: false)
        // Yjs observer will update UI automatically - we don't need to do anything!

        completedCount++

        // Update progress bar
        const progress = (completedCount / totalFiles) * 100
        state.toastProgress = progress
        state.toastCurrent = completedCount

        return { success: true, cardId, file: file.name }
      } catch (error) {
        console.error('Upload failed for', file.name, ':', error)

        // Show red error card with filename
        if (state.sheet) {
          setCard(state.sheet, cardId, {
            title: 'Upload Failed',
            color: '#FF6B6B',
            prompt: file.name,
            isLoading: false,
            uploadFailed: true
          })
        }

        completedCount++

        // Update progress bar even on failure
        const progress = (completedCount / totalFiles) * 100
        state.toastProgress = progress
        state.toastCurrent = completedCount

        return { success: false, cardId, file: file.name, error }
      }
    })

    // Wait for all uploads to complete
    const results = await Promise.all(uploadPromises)

    const successCount = results.filter(r => r.success).length
    const failureCount = results.filter(r => !r.success).length

    // Show final message and reset progress state
    state.toastProgress = undefined
    state.toastCurrent = undefined
    state.toastTotal = undefined

    if (failureCount === 0) {
      showToast(`All ${totalFiles} file${totalFiles > 1 ? 's' : ''} uploaded successfully!`)
    } else {
      showToast(`${successCount}/${totalFiles} file${totalFiles > 1 ? 's' : ''} uploaded. ${failureCount} failed.`)
    }

    // Reset the input so the same files can be uploaded again
    input.value = ''
  }

  // Levels data (stub)
  $: levels = [
    { name: 'Film', count: 0, active: false },
    { name: 'Blocks', count: 0, active: false },
    { name: 'Scenes', count: 0, active: false },
    { name: 'Shots', count: state.cols.length, active: true },
    { name: 'Images', count: 0, active: false }
  ] satisfies Level[]
</script>

<svelte:window onkeydown={handleKeydown} onclick={handleClickOutside} />

<AppLayout
  selectedThumbnailSize={state.selectedThumbnailSize}
  showThumbnailMenu={state.showThumbnailMenu}
  isSoundMuted={state.isSoundMuted}
  stickyTopRow={state.stickyTopRow}
  openEllipsisMenu={state.openEllipsisMenu}
  orientation={state.orientation.name}
  onUndo={handleUndo}
  onRedo={handleRedo}
  onSetOrientation={(newOrientation) => {
    try {
      state.setOrientation(newOrientation)
      state.savePreference('orientation', newOrientation)

      const message = newOrientation === 'horizontal'
        ? 'Switched to horizontal mode - Time flows left-to-right'
        : 'Switched to vertical mode - Time flows top-to-bottom'

      showToast(message)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to change orientation')
    }
  }}
  onRegenerate={handleRegenerate}
  onToggleThumbnailMenu={() => { state.showThumbnailMenu = !state.showThumbnailMenu }}
  onSelectThumbnailSize={(index) => {
    state.selectedThumbnailSize = index
    state.showThumbnailMenu = false
    state.savePreference('thumbnailSize', index)
  }}
  onToggleSound={() => {
    state.isSoundMuted = !state.isSoundMuted
    state.savePreference('isSoundMuted', state.isSoundMuted)
  }}
  onToggleStickyTopRow={() => {
    state.stickyTopRow = !state.stickyTopRow
    state.savePreference('stickyTopRow', state.stickyTopRow)
  }}
  onToggleEllipsisMenu={(id) => {
    const wasOpen = state.openEllipsisMenu === id
    state.openEllipsisMenu = wasOpen ? null : id
  }}
  projectName="nanosheet"
  {levels}
  breadcrumbs={[]}
  onLevelClick={(index) => showToast(`${levels[index].name} feature not yet implemented`)}
  onShowToast={showToast}
>
  {#if state.loading}
    <div class="loading">Loading sheet...</div>
  {:else}
    <SheetGrid
      displayCols={state.displayCols}
      displayRows={state.displayRows}
      rows={state.rows}
      stickyTopRow={state.stickyTopRow}
      orientation={state.orientation.name}
      cellsMap={state.cellsMap}
      cardsMetadata={state.cardsMetadata}
      thumbnailSize={state.thumbnailSize}
      shotTitles={state.shotTitles}
      draggedColumn={state.draggedColumn}
      isColumnDragging={state.isColumnDragging}
      columnDragPreview={state.columnDragPreview}
      isDragging={state.isDragging}
      draggedCard={state.draggedCard}
      dragPreview={state.dragPreview}
      openColumnMenu={state.openColumnMenu}
      timeline={state.timeline}
      bind:frozenRowRef={state.frozenRowRef}
      bind:columnsContainerRef={state.columnsContainerRef}
      bind:frozenColumnRef={state.frozenColumnRef}
      bind:rowsContainerRef={state.rowsContainerRef}
      onSyncColumnsScroll={handleSyncColumnsScroll}
      onSyncRowsScroll={handleSyncRowsScroll}
      onColumnDragStart={(e, colId) => columnDragOps.handleColumnDragStart(e, colId)}
      onColumnDragOver={(e, colId) => columnDragOps.handleColumnDragOver(e, colId)}
      onColumnDrop={(e, colId) => columnDragOps.handleColumnDrop(e, colId)}
      onResetColumnDrag={() => columnDragOps.resetColumnDrag()}
      onDragStart={(e, rowId, colId, cardId) => dragOps.handleDragStart(e, rowId, colId, cardId)}
      onDragOver={(e, rowId, colId, element) => dragOps.handleDragOver(e, rowId, colId, element)}
      onDrop={(e, rowId, colId) => dragOps.handleDrop(e, rowId, colId)}
      onDragEnd={(e) => dragOps.handleDragEnd(e)}
      onCardDoubleClick={(cardId) => cardOps?.handleCardDoubleClick(cardId)}
      onDeleteCard={(rowId, colId) => cardOps?.handleDeleteCard(rowId, colId)}
      onCardTitleInput={(cardId, value) => cardOps?.handleCardTitleInput(cardId, value)}
      onCardTitleChange={(cardId, value) => cardOps?.handleCardTitleChange(cardId, value)}
      onFileUpload={handleFileUpload}
      onShotTitleChange={handleShotTitleChange}
      onToggleColumnMenu={(colId, e) => columnOps?.toggleColumnMenu(colId, e)}
      onCloseColumnMenu={() => { state.openColumnMenu = null }}
      onDuplicateColumn={(colId) => columnOps?.duplicateColumn(colId)}
      onDeleteColumn={(colId) => columnOps?.deleteColumn(colId)}
      onColumnDownload={(colId) => columnOps?.handleColumnDownload(colId)}
      onCardContextMenu={handleCardContextMenu}
    />
  {/if}
</AppLayout>

<CardModal
  show={state.showModal}
  cardId={state.modalCardId}
  mediaId={null}
  title={state.modalTitle}
  color={state.modalColor}
  prompt={state.modalPrompt}
  mediaUrl={state.modalMediaUrl}
  mediaType={state.modalMediaType}
  thumbUrl={state.modalThumbUrl}
  attachments={state.attachments}
  sheet={state.sheet}
  apiUrl={state.apiUrl}
  userId={state.userId}
  cardsMetadata={state.cardsMetadata}
  undoStack={state.undoStack}
  onClose={() => { state.showModal = false }}
  onSave={(updates) => {}}
  onUpdateUndoStack={(stack) => { state.undoStack = stack }}
  onUpdateRedoStack={(stack) => { state.redoStack = stack }}
  onUpdateAttachments={(att) => { state.attachments = att }}
  onShowToast={showToast}
/>

<ToastNotification
  show={state.showToast}
  message={state.toastMessage}
  progress={state.toastProgress}
  current={state.toastCurrent}
  total={state.toastTotal}
/>

<ConfirmDialog
  show={state.showConfirmDialog}
  message={state.confirmMessage}
  onConfirm={() => {
    state.confirmCallback?.()
    state.showConfirmDialog = false
    state.confirmCallback = null
  }}
  onCancel={() => {
    state.showConfirmDialog = false
    state.confirmCallback = null
  }}
/>

<CardContextMenu
  show={state.openCardMenu !== null}
  position={state.cardMenuPosition}
  onSetCover={() => {
    if (state.openCardMenu) {
      cardOps?.handleSetCoverImage(state.openCardMenu)
    }
  }}
  onDownload={() => {
    if (state.openCardMenu) {
      cardOps?.handleDownloadCard(state.openCardMenu)
    }
  }}
  onClose={() => { state.openCardMenu = null }}
/>

<style>
  .loading {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    color: rgba(255, 255, 255, 0.7);
    font-size: 1.2rem;
  }
</style>
