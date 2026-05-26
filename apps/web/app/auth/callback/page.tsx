'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

export default function AuthCallbackPage() {
  const router = useRouter()
  const { ready, authed } = useAuth()

  useEffect(() => {
    if (!ready) return
    if (authed) {
      router.replace('/dashboard')
    } else {
      router.replace('/login')
    }
  }, [ready, authed, router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="rounded-3xl border border-slate-200 bg-white/95 px-8 py-10 shadow-xl shadow-slate-200/20 text-center">
        <p className="text-sm font-medium text-slate-700">Finishing sign in...</p>
        <div className="mt-6 h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    </div>
  )
}
