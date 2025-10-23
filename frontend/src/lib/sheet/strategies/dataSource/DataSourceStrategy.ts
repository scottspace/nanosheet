/**
 * DataSourceStrategy - Abstract interface for different data persistence backends
 *
 * This strategy pattern provides a persistence layer that works WITH Yjs (not instead of it).
 * Yjs handles real-time collaboration and sync via WebSockets, while the data source
 * handles durable storage and initial data loading.
 *
 * Architecture:
 * - Yjs = Real-time collaborative layer (WebSocket sync, CRDT conflict resolution)
 * - DataSource = Persistence layer (load initial data, save changes to backend)
 *
 * Supported backends:
 * - Yjs Server (default - stores in Yjs server's persistence)
 * - File System (directory exploration, file-based storage)
 * - Database (PostgreSQL, MongoDB, etc.)
 * - REST API (traditional backend)
 * - Git (version control exploration)
 *
 * The strategy abstracts away WHERE data is persisted, while maintaining
 * Yjs's real-time collaborative features for all sources.
 */

export interface CellData {
  cardId: string
}

/**
 * Sheet data structure returned by data source
 */
export interface SheetData {
  timeline: string[]      // Row IDs or Col IDs (depending on orientation)
  lanes: string[]         // Col IDs or Row IDs (depending on orientation)
  cells: Map<string, CellData>
  cardsMetadata: Map<string, any>
  laneTitles?: Map<string, string>
}

export interface DataSourceStrategy {
  /** Strategy identifier */
  readonly type: 'yjsServer' | 'filesystem' | 'database' | 'api' | 'git'

  // ============================================================================
  // INITIALIZATION & LIFECYCLE
  // ============================================================================

  /**
   * Initialize the data source and load initial data
   *
   * This is called once at startup to:
   * 1. Connect to the backend
   * 2. Load initial sheet structure and data
   * 3. Populate the Yjs document with this data
   *
   * @param identifier - Sheet ID, file path, database ID, etc.
   * @param options - Strategy-specific options
   * @returns Initial sheet data to populate Yjs
   */
  initialize(identifier: string, options?: any): Promise<SheetData>

  /**
   * Cleanup and disconnect
   */
  disconnect(): Promise<void>

  // ============================================================================
  // PERSISTENCE (WRITE TO BACKEND)
  // ============================================================================

  /**
   * Save the entire sheet state to the backend
   * Called periodically or on explicit save
   *
   * @param data - Current sheet data from Yjs
   */
  saveSheet(data: SheetData): Promise<void>

  /**
   * Save a specific cell update to the backend
   * Called when a cell is modified in Yjs
   *
   * @param key - Cell key (e.g., "row1:col2")
   * @param data - Cell data
   */
  saveCell(key: string, data: CellData | null): Promise<void>

  /**
   * Save card metadata to the backend
   * Called when card metadata is modified in Yjs
   *
   * @param cardId - Card ID
   * @param metadata - Card metadata
   */
  saveCardMetadata(cardId: string, metadata: any): Promise<void>

  /**
   * Save lane reordering to the backend
   * Called when lanes are reordered in Yjs
   *
   * @param lanes - New lane order
   */
  saveLaneOrder(lanes: string[]): Promise<void>

  /**
   * Save timeline reordering to the backend
   * Called when timeline is reordered in Yjs
   *
   * @param timeline - New timeline order
   */
  saveTimelineOrder(timeline: string[]): Promise<void>

  // ============================================================================
  // BATCH OPERATIONS (OPTIONAL OPTIMIZATION)
  // ============================================================================

  /**
   * Start a batch operation
   * Multiple saves will be queued until endBatch() is called
   */
  startBatch?(): void

  /**
   * End batch operation and flush all queued saves
   */
  endBatch?(): Promise<void>

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Get a human-readable label for this data source
   */
  getLabel(): string

  /**
   * Get strategy-specific info (for debugging/display)
   */
  getInfo(): Record<string, any>

  /**
   * Check if backend supports a specific feature
   */
  supports(feature: 'realtime' | 'batch' | 'versioning' | 'search'): boolean
}
