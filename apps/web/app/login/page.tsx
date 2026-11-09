'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'

// SSO is the only login path, deliberately: the previous email/password
// form posted the password straight to Keycloak via the resource-owner
// password grant (ROPC) from this client — that skips Keycloak's own
// hosted login page, and with it MFA, brute-force lockout, and the
// password-reset flow, and the resulting token was stored in
// localStorage and a JS-readable cookie. pubflow-web now has
// directAccessGrantsEnabled: false in Keycloak, so that grant would be
// rejected even if this form still existed.
export default function LoginPage() {
  const { login } = useAuth()
  const [isLoading, setIsLoading] = useState(false)

  const handleSignIn = async () => {
    setIsLoading(true)
    try {
      await login()
    } catch {
      setIsLoading(false)
      toast.error('Could not start sign-in. Please try again.')
      return
    }
    // A successful call above navigates away and unmounts this page
    // (Keycloak's own init()/login() redirect does this directly), so
    // nothing below normally runs. If it's still here after a few
    // seconds, the navigation never actually happened (Keycloak
    // unreachable, a blocked redirect, etc.) — surface that instead of
    // leaving the button disabled with no way out.
    setTimeout(() => {
      setIsLoading(false)
      toast.error('Could not reach the sign-in service. Please try again.')
    }, 8000)
  }

  return (
    <>
      <Header isAuthenticated={false} />

      <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="rounded-2xl bg-white p-8 shadow-xl">
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-bold text-gray-900">Welcome Back</h1>
              <p className="mt-2 text-gray-600">Sign in to your PubFlow account</p>
            </div>

            <button
              onClick={handleSignIn}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 font-medium text-white hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-shadow"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0z" />
              </svg>
              {isLoading ? 'Redirecting…' : 'Sign In'}
            </button>

            <div className="mt-6 text-center">
              <p className="text-gray-600">
                Don&apos;t have an account?{' '}
                <Link href="/signup" className="font-medium text-blue-600 hover:text-blue-700">
                  Sign up free
                </Link>
              </p>
              <p className="mt-2">
                <Link href="/forgot-password" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                  Forgot password?
                </Link>
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-lg bg-white/60 backdrop-blur p-4 text-center text-sm text-gray-600">
            <p>🔒 Your credentials are encrypted and secure. We never share your data.</p>
          </div>
        </div>
      </main>

      <Footer />
    </>
  )
}
