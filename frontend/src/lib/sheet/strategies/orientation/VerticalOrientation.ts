import type { OrientationStrategy } from './OrientationStrategy'

/**
 * VerticalOrientation - Column-major layout (time flows down)
 *
 * In this orientation:
 * - Time flows vertically (down the rows)
 * - Lanes are horizontal (columns)
 * - Cell key format: "row:col" (time:lane)
 * - Cards stack vertically within columns
 * - Frozen lane is the top row (header)
 */
export class VerticalOrientation implements OrientationStrategy {
  readonly name = 'vertical' as const

  // ============================================================================
  // COORDINATE MAPPING
  // ============================================================================

  getTimeline(rows: string[], cols: string[]): string[] {
    return rows // Time flows down the rows
  }

  getLanes(rows: string[], cols: string[]): string[] {
    return cols // Lanes are columns
  }

  cellKey(timeId: string, laneId: string): string {
    return `${timeId}:${laneId}` // row:col format
  }

  parseCellKey(key: string): { timeId: string; laneId: string } {
    const [timeId, laneId] = key.split(':')
    return { timeId, laneId } // timeId is row, laneId is col
  }

  // ============================================================================
  // DRAG & DROP LOGIC
  // ============================================================================

  calculateInsertBefore(
    rect: DOMRect,
    mousePos: { x: number; y: number }
  ): boolean {
    // Compare mouse Y position to vertical midpoint of card
    const cardMidpoint = rect.top + rect.height / 2
    return mousePos.y < cardMidpoint
  }

  getDragAxis(): 'x' | 'y' {
    return 'y' // Vertical dragging
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

    // Shift cards from later times to earlier times (moving forward in time means
    // moving from a later time slot to an earlier time slot, filling gaps)
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
    // Shift cards from earlier times to later times (moving backward in time means
    // pushing cards from an earlier time slot to a later time slot)
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
    return 'row' // Columns side by side
  }

  getLaneFlexDirection(): 'row' | 'column' {
    return 'column' // Cards stack vertically
  }

  getFrozenLaneStyle() {
    return {
      position: 'sticky',
      top: '0',
      width: '100%',
    }
  }
}
