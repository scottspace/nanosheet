/**
 * Yjs sheet helpers for nanosheet
 */
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

export interface SheetConnection {
  doc: Y.Doc
  provider: WebsocketProvider
  rowOrder: Y.Array<string>
  colOrder: Y.Array<string>
  cells: Y.Map<{ cardId: string }>
  cardsMetadata: Y.Map<any>
}

/**
 * Connect to a sheet via WebSocket and get Yjs structures
 */
export function connectSheet(wsUrl: string, sheetId: string): SheetConnection {
  const doc = new Y.Doc()

  // Configure provider with exponential backoff and max retries
  const provider = new WebsocketProvider(wsUrl, sheetId, doc, {
    // Exponential backoff: start at 1s, max at 30s
    connect: true,
    // Control reconnection timing
    maxBackoffTime: 30000, // Max 30 seconds between retries
    // Add params to the WebSocket URL
    params: {}
  })

  // Track reconnection attempts to prevent infinite loops
  let reconnectAttempts = 0
  const MAX_RECONNECT_ATTEMPTS = 10
  let reconnectBackoff = 1000 // Start at 1 second

  provider.on('connection-close', () => {
    reconnectAttempts++
    console.warn(`[WebSocket] Connection closed. Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`)

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[WebSocket] Max reconnection attempts reached. Stopping reconnection.')
      provider.disconnect()
      // Show user-friendly error
      alert('Lost connection to server. Please refresh the page to reconnect.')
    } else {
      // Exponential backoff: double the wait time each attempt, max 30s
      reconnectBackoff = Math.min(reconnectBackoff * 2, 30000)
      console.log(`[WebSocket] Will retry in ${reconnectBackoff}ms`)
    }
  })

  provider.on('status', ({ status }: { status: string }) => {
    if (status === 'connected') {
      // Reset reconnection tracking on successful connection
      reconnectAttempts = 0
      reconnectBackoff = 1000
      console.log('[WebSocket] Connected successfully')
    }
  })

  const rowOrder = doc.getArray<string>('rowOrder')
  const colOrder = doc.getArray<string>('colOrder')
  const cells = doc.getMap<{ cardId: string }>('cells')
  const cardsMetadata = doc.getMap<any>('cardsMetadata')

  return { doc, provider, rowOrder, colOrder, cells, cardsMetadata }
}

/**
 * Generate a unique ID (simple timestamp-based ULID-like)
 */
function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 9)
  return `${prefix}-${timestamp}-${random}`
}

/**
 * Add a new row to the sheet
 */
export function addRow(sheet: SheetConnection): string {
  const rowId = generateId('r')
  sheet.rowOrder.push([rowId])
  return rowId
}

/**
 * Add a new column to the sheet
 */
export function addCol(sheet: SheetConnection, colId?: string): string {
  const newColId = colId || generateId('c')
  sheet.colOrder.push([newColId])
  return newColId
}

/**
 * Add a card to a cell
 */
export function addCard(
  sheet: SheetConnection,
  rowId: string,
  colId: string,
  cardId: string
): void {
  const cellKey = `${rowId}:${colId}`
  sheet.cells.set(cellKey, { cardId })
}

/**
 * Move a card from one cell to another
 */
export function moveCard(
  sheet: SheetConnection,
  fromRow: string,
  fromCol: string,
  toRow: string,
  toCol: string
): void {
  const fromKey = `${fromRow}:${fromCol}`
  const toKey = `${toRow}:${toCol}`

  const card = sheet.cells.get(fromKey)
  if (!card) return

  // Move card to new cell
  sheet.cells.set(toKey, card)

  // Remove from old cell
  sheet.cells.delete(fromKey)
}

/**
 * Delete a card from a cell
 */
export function deleteCard(
  sheet: SheetConnection,
  rowId: string,
  colId: string
): void {
  const cellKey = `${rowId}:${colId}`
  sheet.cells.delete(cellKey)
}

/**
 * Insert a card into a specific position in a column
 */
export function insertCard(
  sheet: SheetConnection,
  fromRow: string,
  fromCol: string,
  targetRow: string,
  targetCol: string,
  insertBefore: boolean
): string | null {
  const fromKey = `${fromRow}:${fromCol}`
  const card = sheet.cells.get(fromKey)
  if (!card) return null

  // Remove card from original position
  sheet.cells.delete(fromKey)

  // Create a new row for the card
  const newRowId = generateId('r')
  const rows = sheet.rowOrder.toArray()
  const targetIndex = rows.indexOf(targetRow)

  if (targetIndex === -1) return null

  // Insert the new row at the appropriate position
  const insertIndex = insertBefore ? targetIndex : targetIndex + 1
  sheet.rowOrder.insert(insertIndex, [newRowId])

  // Place the card in the new row
  const newKey = `${newRowId}:${targetCol}`
  sheet.cells.set(newKey, card)

  return newRowId
}

/**
 * Delete a row and all its cells
 */
export function deleteRow(sheet: SheetConnection, rowId: string): void {
  // Remove all cells in this row
  const cols = sheet.colOrder.toArray()
  cols.forEach(colId => {
    const cellKey = `${rowId}:${colId}`
    sheet.cells.delete(cellKey)
  })

  // Remove row from rowOrder
  const rows = sheet.rowOrder.toArray()
  const rowIndex = rows.indexOf(rowId)
  if (rowIndex !== -1) {
    sheet.rowOrder.delete(rowIndex, 1)
  }
}

/**
 * Copy a row (duplicate all its cells)
 */
export function copyRow(sheet: SheetConnection, sourceRowId: string): string {
  const newRowId = generateId('r')
  sheet.rowOrder.push([newRowId])

  // Copy all cells from source row
  const cols = sheet.colOrder.toArray()
  cols.forEach(colId => {
    const sourceKey = `${sourceRowId}:${colId}`
    const card = sheet.cells.get(sourceKey)
    if (card) {
      const newKey = `${newRowId}:${colId}`
      sheet.cells.set(newKey, { ...card })
    }
  })

  return newRowId
}

/**
 * Copy a column (duplicate all its cells)
 */
export function copyCol(sheet: SheetConnection, sourceColId: string): string {
  const newColId = generateId('c')
  sheet.colOrder.push([newColId])

  // Copy all cells from source column
  const rows = sheet.rowOrder.toArray()
  rows.forEach(rowId => {
    const sourceKey = `${rowId}:${sourceColId}`
    const card = sheet.cells.get(sourceKey)
    if (card) {
      const newKey = `${rowId}:${newColId}`
      sheet.cells.set(newKey, { ...card })
    }
  })

  return newColId
}

/**
 * Get all card IDs from the sheet
 */
export function getAllCardIds(sheet: SheetConnection): string[] {
  const cardIds = new Set<string>()
  sheet.cells.forEach(cell => {
    if (cell && cell.cardId) {
      cardIds.add(cell.cardId)
    }
  })
  return Array.from(cardIds)
}
