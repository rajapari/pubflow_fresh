'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

// Catches errors in the root layout itself — regular error.tsx boundaries
// can't reach that high, so Next.js requires this separate file (which must
// render its own <html>/<body> since the real root layout already failed).
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body>
        <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Something went wrong</h1>
            <p style={{ color: '#666', marginTop: '0.5rem' }}>We&apos;ve been notified and are looking into it.</p>
            <button
              onClick={() => window.location.reload()}
              style={{ marginTop: '1.5rem', padding: '0.5rem 1.5rem', borderRadius: '0.5rem', background: '#2563eb', color: 'white', border: 'none', cursor: 'pointer' }}
            >
              Reload page
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
