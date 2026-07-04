'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { ArrowRight, Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { saveAuthToken, saveRefreshToken } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()
  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [showPw,      setShowPw]      = useState(false)
  const [isLoading,   setIsLoading]   = useState(false)

  const handleOAuthLogin = () => {
    setIsLoading(true)
    const keycloakUrl = process.env.NEXT_PUBLIC_KEYCLOAK_URL    || 'http://localhost:8080'
    const realm       = process.env.NEXT_PUBLIC_KEYCLOAK_REALM  || 'pubflow'
    const clientId    = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || 'pubflow-web'
    const redirectUri = `${window.location.origin}/auth/callback`
    window.location.href = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&response_mode=query&scope=openid`
  }

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      const kcUrl    = process.env.NEXT_PUBLIC_KEYCLOAK_URL       ?? 'http://localhost:8080'
      const kcRealm  = process.env.NEXT_PUBLIC_KEYCLOAK_REALM     ?? 'pubflow'
      const kcClient = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'pubflow-web'

      const res  = await fetch(`${kcUrl}/realms/${kcRealm}/protocol/openid-connect/token`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'password', client_id: kcClient, username: email, password }),
      })
      const data = await res.json()

      if (!data.access_token) {
        const raw = data.error_description ?? data.error ?? 'Invalid email or password'
        toast.error(raw === 'Invalid user credentials' ? 'Invalid email or password' : raw)
        return
      }

      saveAuthToken(data.access_token)
      if (data.refresh_token) saveRefreshToken(data.refresh_token)
      toast.success('Signed in successfully!')
      router.push(new URLSearchParams(window.location.search).get('redirect') ?? '/dashboard')
    } catch {
      toast.error('Login failed. Please try again.')
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
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-bold text-gray-900">Welcome Back</h1>
              <p className="mt-2 text-gray-600">Sign in to your PubFlow account</p>
            </div>

            {/* SSO */}
            <button
              onClick={handleOAuthLogin}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-gray-300 bg-white px-4 py-3 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mb-6"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0z" />
              </svg>
              Sign in with SSO
            </button>

            <div className="mb-6 flex items-center">
              <div className="flex-1 border-t border-gray-200" />
              <span className="px-3 text-sm text-gray-500">Or continue with email</span>
              <div className="flex-1 border-t border-gray-200" />
            </div>

            <form onSubmit={handleEmailLogin} className="space-y-4">
              {/* Email */}
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
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    Password
                  </label>
                  <Link href="/forgot-password" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-gray-300 bg-white pl-10 pr-10 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2.5 font-medium text-white hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-shadow"
              >
                {isLoading ? 'Signing in…' : 'Sign In'}
                {!isLoading && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-gray-600">
                Don&apos;t have an account?{' '}
                <Link href="/signup" className="font-medium text-blue-600 hover:text-blue-700">
                  Sign up free
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
