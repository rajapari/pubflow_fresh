'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { ArrowRight, Mail, Lock, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { saveAuthToken } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()
  const [isDemo, setIsDemo] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    // Avoid next/navigation useSearchParams during prerender; read from window at runtime
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('demo') === 'true') {
        setIsDemo(true)
        setEmail('demo@example.com')
        setPassword('demo-password')
      }
    } catch (e) {
      // noop in non-browser environments
    }
  }, [])
  const [isLoading, setIsLoading] = useState(false)

  const handleOAuthLogin = (provider: 'keycloak' | 'google' | 'github') => {
    setIsLoading(true)
    const keycloakUrl = process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'http://localhost:8080'
    const realm = process.env.NEXT_PUBLIC_KEYCLOAK_REALM || 'pubflow'
    const clientId = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || 'pubflow-web'
    const redirectUri = `${window.location.origin}/auth/callback`

    const oauthUrl = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&response_mode=query&scope=openid`
    window.location.href = oauthUrl
  }

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      // Simulate login for demo
      if (email === 'demo@example.com' && password === 'demo-password') {
        toast.success('Demo login successful!')
        saveAuthToken('demo-token-' + Date.now())
        router.push('/dashboard')
      } else {
        toast.error('Invalid credentials. Try demo@example.com / demo-password')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <Header isAuthenticated={false} />
      
      <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Login Card */}
          <div className="rounded-2xl bg-white p-8 shadow-xl">
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-bold text-gray-900">Welcome Back</h1>
              <p className="mt-2 text-gray-600">Sign in to your PubFlow account</p>
            </div>

            {/* Demo Banner */}
            {isDemo && (
              <div className="mb-6 rounded-lg bg-blue-50 border border-blue-200 p-4">
                <p className="text-sm font-medium text-blue-900">
                  Demo Mode: Use credentials below to explore
                </p>
              </div>
            )}

            {/* OAuth Buttons */}
            <div className="space-y-3 mb-6">
              <button
                onClick={() => handleOAuthLogin('keycloak')}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-gray-300 bg-white px-4 py-3 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0z" />
                </svg>
                Sign in with SSO
              </button>
            </div>

            {/* Divider */}
            <div className="mb-6 flex items-center">
              <div className="flex-1 border-t border-gray-200" />
              <span className="px-3 text-sm text-gray-500">Or continue with email</span>
              <div className="flex-1 border-t border-gray-200" />
            </div>

            {/* Email Form */}
            <form onSubmit={handleEmailLogin} className="space-y-4">
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
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-lg border border-gray-300 bg-white pl-10 pr-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    Password
                  </label>
                  <Link href="/forgot-password" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                    Forgot?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-gray-300 bg-white pl-10 pr-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2.5 font-medium text-white hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-shadow"
              >
                {isLoading ? 'Signing in...' : 'Sign In'}
                {!isLoading && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>

            {/* Demo Info */}
            {isDemo && (
              <div className="mt-4 rounded-lg bg-gray-50 p-4 border border-gray-200">
                <p className="text-xs font-mono text-gray-600 mb-2">Demo Credentials:</p>
                <p className="text-xs text-gray-700 mb-1">
                  <span className="font-medium">Email:</span> demo@example.com
                </p>
                <p className="text-xs text-gray-700">
                  <span className="font-medium">Password:</span> demo-password
                </p>
              </div>
            )}

            {/* Sign Up Link */}
            <div className="mt-6 text-center">
              <p className="text-gray-600">
                Don&apos;t have an account?{' '}
                <Link href="/signup" className="font-medium text-blue-600 hover:text-blue-700">
                  Sign up free
                </Link>
              </p>
            </div>
          </div>

          {/* Security Info */}
          <div className="mt-8 rounded-lg bg-white bg-opacity-60 backdrop-blur p-4 text-center text-sm text-gray-600">
            <p>🔒 Your credentials are encrypted and secure. We never share your data.</p>
          </div>
        </div>
      </main>

      <Footer />
    </>
  )
}
