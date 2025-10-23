/**
 * Strategies - Master export for all strategy patterns
 *
 * This module provides the Strategy Pattern implementation for nanosheet,
 * allowing runtime swapping of:
 * 1. Orientation (vertical/horizontal layouts)
 * 2. Data Source (Yjs/filesystem/local/API backends)
 */

// Orientation Strategies
export type { OrientationStrategy } from './orientation/OrientationStrategy'
export {
  VerticalOrientation,
  HorizontalOrientation,
  createOrientationStrategy
} from './orientation'

// Data Source Strategies
export type { DataSourceStrategy, CellData, SheetData } from './dataSource/DataSourceStrategy'
export {
  YjsServerDataSource,
  FileSystemDataSource,
  createDataSourceStrategy
} from './dataSource'
