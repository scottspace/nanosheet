/**
 * Orientation Strategies - Export all orientation implementations
 */

export type { OrientationStrategy } from './OrientationStrategy'
export { VerticalOrientation } from './VerticalOrientation'
export { HorizontalOrientation } from './HorizontalOrientation'

// Factory function for convenience
export function createOrientationStrategy(
  type: 'vertical' | 'horizontal'
): import('./OrientationStrategy').OrientationStrategy {
  switch (type) {
    case 'vertical':
      return new VerticalOrientation()
    case 'horizontal':
      return new HorizontalOrientation()
    default:
      throw new Error(`Unknown orientation type: ${type}`)
  }
}
