/**
 * The publisher → publication catalogue lives in @pubflow/db/catalog so the
 * database seed and the API share one source of truth. This module re-exports
 * it for existing API-side imports.
 */
export {
  DEFAULT_PUBLISHERS,
  DEFAULT_PUBLICATIONS,
  seedDefaultCatalog,
} from '@pubflow/db/catalog'
export type { DefaultPublisher, DefaultPublication } from '@pubflow/db/catalog'
