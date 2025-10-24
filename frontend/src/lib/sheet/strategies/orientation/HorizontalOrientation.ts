import type { OrientationStrategy } from './OrientationStrategy'

/**
 * HorizontalOrientation - Row-major layout (time flows right)
 *
 * In this orientation:
 * - Time flows horizontally (across the rows)
 * - Lanes are vertical (columns)
 * - Cell key format: "row:col" (time:lane) - SAME as vertical!
 * - Cards line up horizontally within rows
 * - Frozen lane is the left column (sidebar)
 *
 * CRITICAL: The canonical data format never changes based on orientation.
 * rows = time IDs, cols = lane IDs, cells = ${rowId}:${colId}
 * The transpose is achieved purely through CSS, not data transformation.
 */
export class HorizontalOrientation implements OrientationStrategy {
  readonly name = 'horizontal' as const

  // ============================================================================
  // COORDINATE MAPPING
  // ============================================================================

  getTimeline(rows: string[], cols: string[]): string[] {
    return rows // Time flows across (horizontal mode uses rows as time)
  }

  getLanes(rows: string[], cols: string[]): string[] {
    return cols // Lanes stack vertically (horizontal mode uses cols as lanes)
  }

  cellKey(timeId: string, laneId: string): string {
    // CRITICAL: Same format as vertical! ${timeId}:${laneId}
    // This ensures the canonical data structure never changes
    return `${timeId}:${laneId}`
  }

  parseCellKey(key: string): { timeId: string; laneId: string } {
    const [timeId, laneId] = key.split(':')
    return { timeId, laneId }
  }

  // ============================================================================
  // DRAG & DROP LOGIC
  // ============================================================================

  calculateInsertBefore(
    rect: DOMRect,
    mousePos: { x: number; y: number }
  ): boolean {
    // Compare mouse X position to horizontal midpoint of card
    const cardMidpoint = rect.left + rect.width / 2
    return mousePos.x < cardMidpoint
  }

  getDragAxis(): 'x' | 'y' {
    return 'x' // Horizontal dragging
  }

  // ============================================================================
  // CELL SHIFTING OPERATIONS
  // ============================================================================

  shiftCellsForwardInTime(
    cells: Map<string, any>,
    timeline: string[],
    laneId: string,
    startIndex: number,
    endIndex?: number
  ): void {
    const end = endIndex ?? timeline.length

    // Shift cards from later times to earlier times
    // In horizontal mode, later time = further right
    for (let i = startIndex; i < end - 1; i++) {
      const currentKey = this.cellKey(timeline[i], laneId)
      const nextKey = this.cellKey(timeline[i + 1], laneId)

      const nextCard = cells.get(nextKey)
      if (nextCard) {
        cells.delete(nextKey)
        cells.set(currentKey, nextCard)
      } else {
        cells.delete(currentKey)
      }
    }
  }

  shiftCellsBackwardInTime(
    cells: Map<string, any>,
    timeline: string[],
    laneId: string,
    startIndex: number
  ): void {
    // Shift cards from earlier times to later times
    // In horizontal mode, earlier time = further left
    for (let i = timeline.length - 1; i > startIndex; i--) {
      const currentKey = this.cellKey(timeline[i - 1], laneId)
      const prevKey = this.cellKey(timeline[i], laneId)

      const currentCard = cells.get(currentKey)
      if (currentCard && i < timeline.length) {
        cells.delete(currentKey)
        cells.set(prevKey, currentCard)
      }
    }
  }

  // ============================================================================
  // LAYOUT & RENDERING
  // ============================================================================

  getContainerFlexDirection(): 'row' | 'column' {
    return 'column' // Rows stacked vertically
  }

  getLaneFlexDirection(): 'row' | 'column' {
    return 'row' // Cards line up horizontally
  }

  getFrozenLaneStyle() {
    return {
      position: 'sticky',
      left: '0',
      height: '100%',
    }
  }
}
