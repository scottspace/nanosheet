import type { DataSourceStrategy, CellData, SheetData } from './DataSourceStrategy'

/**
 * YjsServerDataSource - Default persistence backend using Yjs server's built-in storage
 *
 * This is the simplest data source - the Yjs server itself handles persistence.
 * The server stores the Yjs document and loads it on reconnect.
 *
 * Flow:
 * 1. Initialize: Load data from Yjs server (server provides persisted state)
 * 2. Changes: Yjs handles real-time sync + server auto-persists
 * 3. Save: No-op (server handles it automatically)
 *
 * This is the default mode - full collaboration, minimal backend complexity.
 */
export class YjsServerDataSource implements DataSourceStrategy {
  readonly type = 'yjsServer' as const

  private sheetId: string = ''
  private connected: boolean = false

  // ============================================================================
  // INITIALIZATION & LIFECYCLE
  // ============================================================================

  async initialize(identifier: string, options?: any): Promise<SheetData> {
    this.sheetId = identifier
    this.connected = true

    // With Yjs server, we don't need to explicitly load data
    // The Yjs connection will automatically load persisted state from the server
    // We return empty data - Yjs will populate it via sync
    return {
      timeline: [],
      lanes: [],
      cells: new Map(),
      cardsMetadata: new Map(),
      laneTitles: new Map(),
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false
    // Yjs connection cleanup handled by SheetState
  }

  // ============================================================================
  // PERSISTENCE (WRITE TO BACKEND)
  // ============================================================================

  async saveSheet(data: SheetData): Promise<void> {
    // No-op: Yjs server automatically persists the document
    // All changes are automatically saved by the Yjs server
  }

  async saveCell(key: string, data: CellData | null): Promise<void> {
    // No-op: Yjs server auto-persists
  }

  async saveCardMetadata(cardId: string, metadata: any): Promise<void> {
    // No-op: Yjs server auto-persists
  }

  async saveLaneOrder(lanes: string[]): Promise<void> {
    // No-op: Yjs server auto-persists
  }

  async saveTimelineOrder(timeline: string[]): Promise<void> {
    // No-op: Yjs server auto-persists
  }

  // ============================================================================
  // BATCH OPERATIONS (NOT NEEDED)
  // ============================================================================

  // No batch operations needed - Yjs handles this

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  getLabel(): string {
    return `Yjs Server: ${this.sheetId}`
  }

  getInfo(): Record<string, any> {
    return {
      type: 'yjsServer',
      sheetId: this.sheetId,
      connected: this.connected,
      persistence: 'automatic (Yjs server)',
      notes: 'All changes auto-persisted by Yjs server',
    }
  }

  supports(feature: 'realtime' | 'batch' | 'versioning' | 'search'): boolean {
    switch (feature) {
      case 'realtime':
        return true // Yjs provides real-time sync
      case 'batch':
        return false // Not needed - Yjs handles efficiently
      case 'versioning':
        return false // Yjs server doesn't provide history by default
      case 'search':
        return false // No built-in search
      default:
        return false
    }
  }
}
