'use client'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink, TRPCClientError } from '@trpc/client'
import { createTRPCReact } from '@trpc/react-query'
import type { AppRouter } from '../lib/trpc-types'
import { getAuthToken, isTokenExpiredOrMissing, refreshAccessToken, clearAuthToken } from '@/lib/auth'

export const trpc = createTRPCReact<AppRouter>()

async function getValidToken(): Promise<string | null> {
  if (!isTokenExpiredOrMissing()) return getAuthToken()
  // Access token is missing or near expiry — try to refresh silently
  const fresh = await refreshAccessToken()
  if (!fresh) {
    // Refresh token is also gone; clear everything and let the 401 propagate
    clearAuthToken()
    return null
  }
  return fresh
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        // Don't refetch every query whenever the browser window regains
        // focus — it made pages visibly "reload" on each window switch.
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // Don't retry on auth errors
          if (error instanceof TRPCClientError && error.data?.httpStatus === 401) return false
          return failureCount < 2
        },
      },
    },
  }))

  const [tc] = useState(() =>
    trpc.createClient({
      links: [httpBatchLink({
        url: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/trpc`,
        async headers() {
          if (typeof window === 'undefined') return {}
          const token = await getValidToken()
          return token ? { Authorization: `Bearer ${token}` } : {}
        },
      })],
    })
  )

  return (
    <trpc.Provider client={tc} queryClient={qc}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </trpc.Provider>
  )
}
