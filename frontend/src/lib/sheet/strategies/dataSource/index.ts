/**
 * Data Source Strategies - Export all data source implementations
 */

export type { DataSourceStrategy, CellData, SheetData } from './DataSourceStrategy'
export { YjsServerDataSource } from './YjsServerDataSource'
export { FileSystemDataSource } from './FileSystemDataSource'

// Factory function for convenience
export function createDataSourceStrategy(
  type: 'yjsServer' | 'filesystem' | 'database' | 'api'
): import('./DataSourceStrategy').DataSourceStrategy {
  switch (type) {
    case 'yjsServer':
      return new YjsServerDataSource()
    case 'filesystem':
      return new FileSystemDataSource()
    default:
      throw new Error(`Data source type not yet implemented: ${type}`)
  }
}
