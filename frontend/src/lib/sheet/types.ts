export type Orientation = 'vertical' | 'horizontal'
export type ThumbnailSize = 'small' | 'medium' | 'large'

export interface DraggedCard {
  timeId: string
  laneId: string
  cardId: string
}

export interface DragPreview {
  targetLane: string
  targetTime: string
  insertBefore: boolean
}

export interface ColumnDragPreview {
  targetColIndex: number
  insertBefore: boolean
}

export interface UndoOperation {
  type: 'delete' | 'insert' | 'move'
  cardId: string
  fromTimeId: string
  fromLaneId: string
  toTimeId?: string
  toLaneId?: string
}

export interface Card {
  cardId?: string
  title: string
  color: string
  thumb_url?: string
  media_url?: string
  media_type?: 'image' | 'video'
  isLoading?: boolean
  number?: string
  prompt?: string
  attachments?: any[]
}
