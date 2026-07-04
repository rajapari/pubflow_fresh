'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'

export default function ForgotPasswordPage() {
  const [email,     setEmail]     = useState('')
  const [sent,      setSent]      = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.includes('@')) { toast.error('Please enter a valid email address'); return }

    setIsLoading(true)
    try {
      await fetch('/api/auth/reset-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      })
      // Always show success — don't reveal whether the email exists
      setSent(true)
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <Header isAuthenticated={false} />

      <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="rounded-2xl bg-white p-8 shadow-xl">

            {sent ? (
              /* ── Success state ── */
              <div className="text-center space-y-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900">Check your email</h1>
                <p className="text-gray-600">
                  If an account exists for <span className="font-medium text-gray-900">{email}</span>,
                  we&apos;ve sent a password reset link. Check your inbox and follow the instructions.
                </p>
                <p className="text-sm text-gray-500">
                  Didn&apos;t receive it? Check your spam folder, or{' '}
                  <button
                    type="button"
                    className="text-blue-600 hover:text-blue-700 font-medium"
                    onClick={() => setSent(false)}
                  >
                    try again
                  </button>.
                </p>
                <Link
                  href="/login"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  <ArrowLeft className="h-4 w-4" /> Back to sign in
                </Link>
              </div>
            ) : (
              /* ── Form state ── */
              <>
                <div className="mb-8">
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back to sign in
                  </Link>
                  <h1 className="text-2xl font-bold text-gray-900">Forgot your password?</h1>
                  <p className="mt-2 text-gray-600">
                    Enter the email address you registered with and we&apos;ll send you a reset link.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full rounded-lg border border-gray-300 bg-white pl-10 pr-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        required
                        autoFocus
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2.5 font-medium text-white hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-shadow"
                  >
                    {isLoading ? 'Sending…' : 'Send Reset Link'}
                  </button>
                </form>
              </>
            )}
          </div>

          <div className="mt-8 rounded-lg bg-white/60 backdrop-blur p-4 text-center text-sm text-gray-600">
            <p>🔒 Reset links expire after 24 hours for your security.</p>
          </div>
        </div>
      </main>

      <Footer />
    </>
  )
}
