import type { Orientation } from './types'

export class SheetLayout {
  constructor(
    public orientation: Orientation,
    public rows: string[],
    public cols: string[]
  ) {}

  get timeline(): string[] {
    return this.orientation === 'vertical' ? this.rows : this.cols
  }

  get lanes(): string[] {
    return this.orientation === 'vertical' ? this.cols : this.rows
  }

  get fixedLane(): string | null {
    return this.lanes.length > 0 ? this.lanes[0] : null
  }

  cellKey(timeId: string, laneId: string): string {
    return this.orientation === 'vertical'
      ? `${timeId}:${laneId}`
      : `${laneId}:${timeId}`
  }

  parseCellKey(key: string): { timeId: string; laneId: string } {
    const [a, b] = key.split(':')
    return this.orientation === 'vertical'
      ? { timeId: a, laneId: b }
      : { timeId: b, laneId: a }
  }
}
