/**
 * ColumnOperations - Handles lane/column management operations
 *
 * This class encapsulates all logic for managing lanes (columns in vertical mode,
 * rows in horizontal mode) including:
 * - Deleting entire lanes
 * - Duplicating lanes
 * - Downloading lane contents as a zip file
 * - Managing lane menus
 */

import type { OrientationStrategy } from '../strategies/orientation/OrientationStrategy'
import type { SheetConnection } from '../../ySheet'

/**
 * Callbacks for column operations
 */
export interface ColumnOperationCallbacks {
  /**
   * Show a toast notification
   */
  showToastNotification: (message: string, duration: number) => void

  /**
   * Show a confirmation dialog
   */
  showConfirm: (message: string, onConfirm: () => void) => void

  /**
   * Record an undo operation
   */
  onRecordUndo: (operation: {
    type: 'deleteColumn' | 'duplicateColumn'
    userId: string
    colId?: string
    columnIndex?: number
    columnCells?: Map<string, { cardId: string }>
    sourceColId?: string
  }) => void

  /**
   * Clear the redo stack after a new operation
   */
  onClearRedo: () => void
}

/**
 * State container for column menu
 */
export interface ColumnMenuState {
  openColumnMenu: string | null
}

/**
 * ColumnOperations class manages lane operations
 */
export class ColumnOperations {
  private strategy: OrientationStrategy
  private menuState: ColumnMenuState
  private callbacks: ColumnOperationCallbacks
  private userId: string
  private apiUrl: string
  private getSheet: () => SheetConnection | null
  private getCols: () => string[]
  private getTimeline: () => string[]
  private getCellsMap: () => Map<string, { cardId: string }>
  private getCardsMetadata: () => Map<string, any>
  private getShotTitles: () => Map<string, string>
  private getOrientation: () => 'vertical' | 'horizontal'

  /**
   * Constructor
   *
   * @param strategy - Orientation strategy for coordinate mapping
   * @param menuState - Reactive menu state object (will be mutated)
   * @param callbacks - Callbacks for notifications and confirmations
   * @param userId - Current user ID for undo tracking
   * @param apiUrl - API URL for download operations
   * @param getSheet - Function that returns current SheetConnection
   * @param getCols - Function that returns current cols array
   * @param getTimeline - Function that returns current timeline array
   * @param getCellsMap - Function that returns current cells map
   * @param getCardsMetadata - Function that returns current cards metadata
   * @param getShotTitles - Function that returns current shot titles
   * @param getOrientation - Function that returns current orientation
   */
  constructor(
    strategy: OrientationStrategy,
    menuState: ColumnMenuState,
    callbacks: ColumnOperationCallbacks,
    userId: string,
    apiUrl: string,
    getSheet: () => SheetConnection | null,
    getCols: () => string[],
    getTimeline: () => string[],
    getCellsMap: () => Map<string, { cardId: string }>,
    getCardsMetadata: () => Map<string, any>,
    getShotTitles: () => Map<string, string>,
    getOrientation: () => 'vertical' | 'horizontal'
  ) {
    this.strategy = strategy
    this.menuState = menuState
    this.callbacks = callbacks
    this.userId = userId
    this.apiUrl = apiUrl
    this.getSheet = getSheet
    this.getCols = getCols
    this.getTimeline = getTimeline
    this.getCellsMap = getCellsMap
    this.getCardsMetadata = getCardsMetadata
    this.getShotTitles = getShotTitles
    this.getOrientation = getOrientation
  }

  /**
   * Delete an entire lane
   *
   * Removes all cells in the lane and removes the lane from the lane order.
   * Records an undo operation with all lane contents for potential restoration.
   *
   * @param colId - ID of the lane to delete
   */
  deleteColumn(colId: string): void {
    const sheet = this.getSheet()
    if (!sheet) return

    const cols = this.getCols()
    const colIndex = cols.indexOf(colId)
    if (colIndex === -1) return

    // Map colId to semantic lane
    const orientation = this.getOrientation()
    const lane = orientation === 'vertical' ? colId : colId

    // Save lane state for undo
    const columnCells = new Map<string, { cardId: string }>()
    const timeline = this.getTimeline()
    timeline.forEach(timeId => {
      const key = this.strategy.cellKey(timeId, lane)
      const cell = sheet.cells.get(key)
      if (cell) {
        columnCells.set(key, { ...cell })
      }
    })

    // Save to undo stack
    this.callbacks.onRecordUndo({
      type: 'deleteColumn',
      userId: this.userId,
      colId,
      columnIndex: colIndex,
      columnCells
    })
    this.callbacks.onClearRedo()

    // Delete all cells in this lane
    timeline.forEach(timeId => {
      const key = this.strategy.cellKey(timeId, lane)
      sheet.cells.delete(key)
    })

    // Remove lane from colOrder
    sheet.colOrder.delete(colIndex, 1)

    console.log('[ColumnOperations.deleteColumn] Deleted lane:', lane, 'saved to undo stack')
  }

  /**
   * Duplicate a lane
   *
   * Creates a new lane immediately after the source lane and copies all cells
   * from the source lane to the new lane. Records an undo operation.
   *
   * @param sourceColId - ID of the lane to duplicate
   */
  duplicateColumn(sourceColId: string): void {
    const sheet = this.getSheet()
    if (!sheet) return

    const colsArray = sheet.colOrder.toArray()
    const sourceIndex = colsArray.indexOf(sourceColId)
    if (sourceIndex === -1) return

    // Generate a new lane ID
    const newColId = `c-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`

    // Map to semantic lanes
    const orientation = this.getOrientation()
    const sourceLane = orientation === 'vertical' ? sourceColId : sourceColId
    const newLane = orientation === 'vertical' ? newColId : newColId

    // Insert new lane immediately after source lane
    colsArray.splice(sourceIndex + 1, 0, newColId)
    sheet.colOrder.delete(0, sheet.colOrder.length)
    sheet.colOrder.push(colsArray)

    // Save to undo stack
    this.callbacks.onRecordUndo({
      type: 'duplicateColumn',
      userId: this.userId,
      colId: newColId,
      sourceColId: sourceColId
    })
    this.callbacks.onClearRedo()

    // Copy all cells from source lane to new lane
    const timeline = this.getTimeline()
    timeline.forEach(timeId => {
      const sourceKey = this.strategy.cellKey(timeId, sourceLane)
      const cell = sheet.cells.get(sourceKey)
      if (cell) {
        const newKey = this.strategy.cellKey(timeId, newLane)
        sheet.cells.set(newKey, { ...cell })
      }
    })

    console.log('[ColumnOperations.duplicateColumn] Duplicated lane', sourceLane, 'to', newLane, 'at index', sourceIndex + 1)
  }

  /**
   * Download lane contents as a zip file
   *
   * Calls the backend API to generate a zip file containing all cards in the lane.
   * The zip includes media files and metadata.
   *
   * @param colId - ID of the lane to download
   */
  async handleColumnDownload(colId: string): Promise<void> {
    const sheet = this.getSheet()
    if (!sheet) return

    try {
      // Get lane title
      const orientation = this.getOrientation()
      const lane = orientation === 'vertical' ? colId : colId
      const shotTitles = this.getShotTitles()
      const columnTitle = shotTitles.get(colId) || `Shot ${colId}`

      // Get all cards in this lane
      const timeline = this.getTimeline()
      const cellsMap = this.getCellsMap()
      const cardsMetadata = this.getCardsMetadata()

      const columnCards = timeline.map(timeId => {
        const key = this.strategy.cellKey(timeId, lane)
        const cell = cellsMap.get(key)
        const cardId = cell?.cardId
        return cardId ? cardsMetadata.get(cardId) : null
      }).filter(card => card !== null)

      if (columnCards.length === 0) {
        this.callbacks.showToastNotification('No cards in this column to export', 3000)
        return
      }

      // Show downloading toast
      this.callbacks.showToastNotification('Downloading...', 0)

      // Call backend to generate zip
      const response = await fetch(`${this.apiUrl}/api/columns/${colId}/download`, {
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

      console.log('[ColumnOperations.handleColumnDownload] Downloaded column:', colId)

      // Show success toast (note: caller should handle hiding the "Downloading..." toast first)
      this.callbacks.showToastNotification('Download complete!', 3000)
    } catch (error) {
      console.error('[ColumnOperations.handleColumnDownload] Error downloading column:', error)
      this.callbacks.showToastNotification('Failed to download column', 3000)
    }
  }

  /**
   * Toggle column menu visibility
   *
   * Opens or closes the context menu for a specific lane.
   *
   * @param colId - ID of the lane whose menu to toggle
   * @param e - Mouse event (will be stopped from propagating)
   */
  toggleColumnMenu(colId: string, e: MouseEvent): void {
    e.stopPropagation()
    this.menuState.openColumnMenu = this.menuState.openColumnMenu === colId ? null : colId
  }

  /**
   * Close the column menu
   *
   * Closes any open lane context menu.
   */
  closeColumnMenu(): void {
    this.menuState.openColumnMenu = null
  }
}
