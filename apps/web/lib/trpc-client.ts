// Re-export the trpc instance from providers for convenience
// This avoids having to import from components/providers in every file
export { trpc } from '@/components/providers'
export type { AppRouter } from './trpc-types'
