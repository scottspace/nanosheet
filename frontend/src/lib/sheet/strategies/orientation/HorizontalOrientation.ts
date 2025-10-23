import type { OrientationStrategy } from './OrientationStrategy'

/**
 * HorizontalOrientation - Row-major layout (time flows right)
 *
 * In this orientation:
 * - Time flows horizontally (across the columns)
 * - Lanes are vertical (rows)
 * - Cell key format: "col:row" (time:lane) - SWAPPED from vertical!
 * - Cards line up horizontally within rows
 * - Frozen lane is the left column (sidebar)
 */
export class HorizontalOrientation implements OrientationStrategy {
  readonly name = 'horizontal' as const

  // ============================================================================
  // COORDINATE MAPPING
  // ============================================================================

  getTimeline(rows: string[], cols: string[]): string[] {
    return cols // Time flows across the columns
  }

  getLanes(rows: string[], cols: string[]): string[] {
    return rows // Lanes are rows
  }

  cellKey(timeId: string, laneId: string): string {
    // IMPORTANT: Swapped! col:row format
    // timeId is a col (time flows horizontally)
    // laneId is a row (lanes are horizontal tracks)
    return `${laneId}:${timeId}`
  }

  parseCellKey(key: string): { timeId: string; laneId: string } {
    const [laneId, timeId] = key.split(':')
    return { timeId, laneId } // timeId is col, laneId is row
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
