/**
 * OrientationStrategy - Abstract interface for different sheet orientations
 *
 * This strategy pattern allows seamless switching between vertical (column-major)
 * and horizontal (row-major) orientations, and enables future orientations like
 * diagonal, radial, or other custom layouts.
 */

export interface OrientationStrategy {
  /** Strategy identifier */
  readonly name: 'vertical' | 'horizontal'

  // ============================================================================
  // COORDINATE MAPPING
  // ============================================================================

  /**
   * Get the timeline dimension (time flows along this axis)
   * - Vertical: rows (time flows down)
   * - Horizontal: cols (time flows right)
   */
  getTimeline(rows: string[], cols: string[]): string[]

  /**
   * Get the lanes dimension (parallel tracks)
   * - Vertical: cols (lanes are columns)
   * - Horizontal: rows (lanes are rows)
   */
  getLanes(rows: string[], cols: string[]): string[]

  /**
   * Construct a cell key from semantic time/lane IDs
   * CRITICAL: Both orientations return ${timeId}:${laneId}
   * The canonical format never changes based on orientation!
   */
  cellKey(timeId: string, laneId: string): string

  /**
   * Parse a cell key back into semantic time/lane IDs
   */
  parseCellKey(key: string): { timeId: string; laneId: string }

  // ============================================================================
  // DRAG & DROP LOGIC
  // ============================================================================

  /**
   * Calculate whether to insert before or after based on mouse position
   * - Vertical: Compare mouse Y to card vertical midpoint
   * - Horizontal: Compare mouse X to card horizontal midpoint
   */
  calculateInsertBefore(
    rect: DOMRect,
    mousePos: { x: number; y: number }
  ): boolean

  /**
   * Get the primary drag axis for cursor positioning
   * - Vertical: 'y'
   * - Horizontal: 'x'
   */
  getDragAxis(): 'x' | 'y'

  // ============================================================================
  // CELL SHIFTING OPERATIONS (for drag/drop and undo/redo)
  // ============================================================================

  /**
   * Shift cells forward in time (toward later times)
   * Used when:
   * - Removing a card (fill the gap by shifting cells backward in time)
   * - Making room for insertion (shift cells forward)
   *
   * @param cells - The Yjs cells map
   * @param timeline - All time points
   * @param laneId - Which lane to shift
   * @param startIndex - Index in timeline to start shifting from
   * @param endIndex - Index in timeline to stop shifting (optional, defaults to end)
   */
  shiftCellsForwardInTime(
    cells: Map<string, any>,
    timeline: string[],
    laneId: string,
    startIndex: number,
    endIndex?: number
  ): void

  /**
   * Shift cells backward in time (toward earlier times)
   * Used when:
   * - Inserting a card (push existing cards later in time)
   * - Filling gaps after deletion
   *
   * @param cells - The Yjs cells map
   * @param timeline - All time points
   * @param laneId - Which lane to shift
   * @param startIndex - Index in timeline to start shifting from
   */
  shiftCellsBackwardInTime(
    cells: Map<string, any>,
    timeline: string[],
    laneId: string,
    startIndex: number
  ): void

  // ============================================================================
  // LAYOUT & RENDERING
  // ============================================================================

  /**
   * Get the CSS flex direction for the main container
   * - Vertical: 'row' (columns side by side)
   * - Horizontal: 'column' (rows stacked)
   */
  getContainerFlexDirection(): 'row' | 'column'

  /**
   * Get the CSS flex direction for a single lane
   * - Vertical: 'column' (cards stacked vertically)
   * - Horizontal: 'row' (cards lined up horizontally)
   */
  getLaneFlexDirection(): 'row' | 'column'

  /**
   * Get the frozen lane CSS positioning
   * - Vertical: Sticky top row
   * - Horizontal: Sticky left column
   */
  getFrozenLaneStyle(): {
    position: string
    top?: string
    left?: string
    width?: string
    height?: string
  }
}
